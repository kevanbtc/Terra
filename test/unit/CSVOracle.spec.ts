import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { CSVOracle, CSVOracle__factory } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CSVOracle", function () {
    let oracle: CSVOracle;
    let governor: SignerWithAddress;
    let guardian: SignerWithAddress;
    let attestor1: SignerWithAddress;
    let attestor2: SignerWithAddress;
    let attestor3: SignerWithAddress;
    let user: SignerWithAddress;
    
    const DOMAIN_NAME = "CSVOracle";
    const DOMAIN_VERSION = "1";
    const ORACLE_DATA_TYPEHASH = ethers.keccak256(
        ethers.toUtf8Bytes(
            "OracleData(uint256 navPerToken,uint256 totalSupply,uint256 utilizationBps,uint256 ltvBps,uint256 timestamp,uint256 blockNumber,string dataCID,uint256 nonce)"
        )
    );

    beforeEach(async function () {
        [governor, guardian, attestor1, attestor2, attestor3, user] = await ethers.getSigners();
        
        const OracleFactory = await ethers.getContractFactory("CSVOracle");
        oracle = await OracleFactory.deploy(
            governor.address,
            guardian.address,
            [attestor1.address, attestor2.address, attestor3.address],
            2 // 2-of-3 threshold
        );
    });

    describe("Deployment", function () {
        it("Should set correct initial values", async function () {
            expect(await oracle.getAttestorCount()).to.equal(3);
            expect(await oracle.getThreshold()).to.equal(2);
            expect(await oracle.isAttestor(attestor1.address)).to.be.true;
            expect(await oracle.isAttestor(attestor2.address)).to.be.true;
            expect(await oracle.isAttestor(attestor3.address)).to.be.true;
            expect(await oracle.getFreshnessTimeout()).to.equal(3600); // 1 hour default
        });

        it("Should grant correct roles", async function () {
            const GOVERNOR_ROLE = await oracle.GOVERNOR_ROLE();
            const GUARDIAN_ROLE = await oracle.GUARDIAN_ROLE();
            
            expect(await oracle.hasRole(GOVERNOR_ROLE, governor.address)).to.be.true;
            expect(await oracle.hasRole(GUARDIAN_ROLE, guardian.address)).to.be.true;
        });

        it("Should revert with zero attestors", async function () {
            const OracleFactory = await ethers.getContractFactory("CSVOracle");
            await expect(
                OracleFactory.deploy(
                    governor.address,
                    guardian.address,
                    [], // empty attestors
                    1
                )
            ).to.be.revertedWithCustomError(oracle, "ZeroAddress");
        });

        it("Should revert with invalid threshold", async function () {
            const OracleFactory = await ethers.getContractFactory("CSVOracle");
            await expect(
                OracleFactory.deploy(
                    governor.address,
                    guardian.address,
                    [attestor1.address],
                    2 // threshold > attestors
                )
            ).to.be.revertedWithCustomError(oracle, "InvalidParameter");
        });
    });

    describe("Oracle Data Updates", function () {
        let validOracleData: any;
        let domainSeparator: string;

        beforeEach(async function () {
            const currentTime = await time.latest();
            validOracleData = {
                navPerToken: ethers.parseEther("1.5"),
                totalSupply: ethers.parseEther("1000000"),
                utilizationBps: 7500,
                ltvBps: 6000,
                timestamp: currentTime,
                blockNumber: await ethers.provider.getBlockNumber(),
                dataCID: "QmTestCID123",
                nonce: 1
            };

            domainSeparator = await oracle.getDomainSeparator();
        });

        async function signOracleData(signer: SignerWithAddress, data: any) {
            const structHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32", "uint256"],
                    [
                        ORACLE_DATA_TYPEHASH,
                        data.navPerToken,
                        data.totalSupply,
                        data.utilizationBps,
                        data.ltvBps,
                        data.timestamp,
                        data.blockNumber,
                        ethers.keccak256(ethers.toUtf8Bytes(data.dataCID)),
                        data.nonce
                    ]
                )
            );

            const hash = ethers.keccak256(
                ethers.concat([
                    ethers.toUtf8Bytes("\x19\x01"),
                    domainSeparator,
                    structHash
                ])
            );

            return await signer.signMessage(ethers.getBytes(hash));
        }

        it("Should update oracle data with valid signatures", async function () {
            const sig1 = await signOracleData(attestor1, validOracleData);
            const sig2 = await signOracleData(attestor2, validOracleData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: sig2 }
            ];

            await expect(oracle.updateOracleData(validOracleData, signatures))
                .to.emit(oracle, "OracleDataUpdated")
                .withArgs(
                    validOracleData.timestamp,
                    validOracleData.navPerToken,
                    validOracleData.dataCID,
                    validOracleData.nonce
                );

            const latestData = await oracle.getLatestData();
            expect(latestData.navPerToken).to.equal(validOracleData.navPerToken);
            expect(latestData.dataCID).to.equal(validOracleData.dataCID);
        });

        it("Should revert with insufficient signatures", async function () {
            const sig1 = await signOracleData(attestor1, validOracleData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 }
            ];

            await expect(oracle.updateOracleData(validOracleData, signatures))
                .to.be.revertedWithCustomError(oracle, "InsufficientAttestors");
        });

        it("Should revert with invalid signature", async function () {
            const sig1 = await signOracleData(attestor1, validOracleData);
            const invalidSig = "0x" + "0".repeat(130); // Invalid signature

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: invalidSig }
            ];

            await expect(oracle.updateOracleData(validOracleData, signatures))
                .to.be.revertedWithCustomError(oracle, "InvalidSignature");
        });

        it("Should revert with unauthorized attestor", async function () {
            const sig1 = await signOracleData(attestor1, validOracleData);
            const sig2 = await signOracleData(user, validOracleData); // user is not attestor

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: user.address, signature: sig2 }
            ];

            await expect(oracle.updateOracleData(validOracleData, signatures))
                .to.be.revertedWithCustomError(oracle, "UnauthorizedAttestor");
        });

        it("Should revert with reused nonce", async function () {
            const sig1 = await signOracleData(attestor1, validOracleData);
            const sig2 = await signOracleData(attestor2, validOracleData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: sig2 }
            ];

            // First update should succeed
            await oracle.updateOracleData(validOracleData, signatures);

            // Second update with same nonce should fail
            await expect(oracle.updateOracleData(validOracleData, signatures))
                .to.be.revertedWithCustomError(oracle, "InvalidNonce");
        });

        it("Should revert with future timestamp", async function () {
            const futureTime = (await time.latest()) + 3600;
            const futureData = { ...validOracleData, timestamp: futureTime };

            const sig1 = await signOracleData(attestor1, futureData);
            const sig2 = await signOracleData(attestor2, futureData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: sig2 }
            ];

            await expect(oracle.updateOracleData(futureData, signatures))
                .to.be.revertedWithCustomError(oracle, "InvalidParameter");
        });

        it("Should revert with stale timestamp", async function () {
            const staleTime = (await time.latest()) - 7200; // 2 hours ago
            const staleData = { ...validOracleData, timestamp: staleTime };

            const sig1 = await signOracleData(attestor1, staleData);
            const sig2 = await signOracleData(attestor2, staleData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: sig2 }
            ];

            await expect(oracle.updateOracleData(staleData, signatures))
                .to.be.revertedWithCustomError(oracle, "StaleData");
        });
    });

    describe("Data Freshness", function () {
        it("Should return true for fresh data", async function () {
            // Setup fresh data
            const currentTime = await time.latest();
            const freshData = {
                navPerToken: ethers.parseEther("1.5"),
                totalSupply: ethers.parseEther("1000000"),
                utilizationBps: 7500,
                ltvBps: 6000,
                timestamp: currentTime,
                blockNumber: await ethers.provider.getBlockNumber(),
                dataCID: "QmTestCID123",
                nonce: 1
            };

            const sig1 = await signOracleData(attestor1, freshData);
            const sig2 = await signOracleData(attestor2, freshData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: sig2 }
            ];

            await oracle.updateOracleData(freshData, signatures);
            expect(await oracle.isFresh()).to.be.true;

            const [navPerToken, isStale] = await oracle.getNavPerToken();
            expect(navPerToken).to.equal(freshData.navPerToken);
            expect(isStale).to.be.false;
        });

        it("Should return false for stale data", async function () {
            // Setup stale data by advancing time
            await time.increase(3601); // More than 1 hour

            expect(await oracle.isFresh()).to.be.false;

            const [navPerToken, isStale] = await oracle.getNavPerToken();
            expect(isStale).to.be.true;
        });

        async function signOracleData(signer: SignerWithAddress, data: any) {
            const domainSeparator = await oracle.getDomainSeparator();
            const structHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32", "uint256"],
                    [
                        ORACLE_DATA_TYPEHASH,
                        data.navPerToken,
                        data.totalSupply,
                        data.utilizationBps,
                        data.ltvBps,
                        data.timestamp,
                        data.blockNumber,
                        ethers.keccak256(ethers.toUtf8Bytes(data.dataCID)),
                        data.nonce
                    ]
                )
            );

            const hash = ethers.keccak256(
                ethers.concat([
                    ethers.toUtf8Bytes("\x19\x01"),
                    domainSeparator,
                    structHash
                ])
            );

            return await signer.signMessage(ethers.getBytes(hash));
        }
    });

    describe("Attestor Management", function () {
        it("Should add new attestor", async function () {
            const newAttestor = user;

            await expect(oracle.connect(governor).addAttestor(newAttestor.address))
                .to.emit(oracle, "AttestorAdded")
                .withArgs(newAttestor.address);

            expect(await oracle.isAttestor(newAttestor.address)).to.be.true;
            expect(await oracle.getAttestorCount()).to.equal(4);
        });

        it("Should remove attestor", async function () {
            await expect(oracle.connect(governor).removeAttestor(attestor3.address))
                .to.emit(oracle, "AttestorRemoved")
                .withArgs(attestor3.address);

            expect(await oracle.isAttestor(attestor3.address)).to.be.false;
            expect(await oracle.getAttestorCount()).to.equal(2);
        });

        it("Should update threshold", async function () {
            await expect(oracle.connect(governor).updateThreshold(1))
                .to.emit(oracle, "ThresholdUpdated")
                .withArgs(2, 1);

            expect(await oracle.getThreshold()).to.equal(1);
        });

        it("Should revert threshold update from non-governor", async function () {
            await expect(oracle.connect(user).updateThreshold(1))
                .to.be.revertedWithCustomError(oracle, "UnauthorizedRole");
        });

        it("Should update freshness timeout", async function () {
            const newTimeout = 7200; // 2 hours

            await expect(oracle.connect(governor).updateFreshnessTimeout(newTimeout))
                .to.emit(oracle, "FreshnessTimeoutUpdated")
                .withArgs(3600, newTimeout);

            expect(await oracle.getFreshnessTimeout()).to.equal(newTimeout);
        });
    });

    describe("Pause Functionality", function () {
        it("Should pause and unpause oracle", async function () {
            await oracle.connect(guardian).emergencyPause("Testing pause");
            expect(await oracle.isPaused()).to.be.true;

            await oracle.connect(governor).unpause();
            expect(await oracle.isPaused()).to.be.false;
        });

        it("Should revert oracle updates when paused", async function () {
            await oracle.connect(guardian).emergencyPause("Testing pause");

            const currentTime = await time.latest();
            const oracleData = {
                navPerToken: ethers.parseEther("1.5"),
                totalSupply: ethers.parseEther("1000000"),
                utilizationBps: 7500,
                ltvBps: 6000,
                timestamp: currentTime,
                blockNumber: await ethers.provider.getBlockNumber(),
                dataCID: "QmTestCID123",
                nonce: 1
            };

            const sig1 = await signOracleData(attestor1, oracleData);
            const sig2 = await signOracleData(attestor2, oracleData);

            const signatures = [
                { attestor: attestor1.address, signature: sig1 },
                { attestor: attestor2.address, signature: sig2 }
            ];

            await expect(oracle.updateOracleData(oracleData, signatures))
                .to.be.revertedWithCustomError(oracle, "SystemPaused");
        });

        async function signOracleData(signer: SignerWithAddress, data: any) {
            const domainSeparator = await oracle.getDomainSeparator();
            const structHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32", "uint256"],
                    [
                        ORACLE_DATA_TYPEHASH,
                        data.navPerToken,
                        data.totalSupply,
                        data.utilizationBps,
                        data.ltvBps,
                        data.timestamp,
                        data.blockNumber,
                        ethers.keccak256(ethers.toUtf8Bytes(data.dataCID)),
                        data.nonce
                    ]
                )
            );

            const hash = ethers.keccak256(
                ethers.concat([
                    ethers.toUtf8Bytes("\x19\x01"),
                    domainSeparator,
                    structHash
                ])
            );

            return await signer.signMessage(ethers.getBytes(hash));
        }
    });
});
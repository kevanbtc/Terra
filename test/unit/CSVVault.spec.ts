import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    CSVVault, 
    ERCRWACSV, 
    CSVOracle, 
    MockERC20,
    CSVVault__factory,
    ERCRWACSV__factory,
    CSVOracle__factory
} from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CSVVault", function () {
    let vault: CSVVault;
    let csvToken: ERCRWACSV;
    let oracle: CSVOracle;
    let stablecoin: MockERC20;
    let governor: SignerWithAddress;
    let guardian: SignerWithAddress;
    let attestor1: SignerWithAddress;
    let attestor2: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const INITIAL_NAV = ethers.parseEther("1.0");
    const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC (6 decimals)

    beforeEach(async function () {
        [governor, guardian, attestor1, attestor2, user1, user2] = await ethers.getSigners();

        // Deploy mock stablecoin (USDC)
        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        stablecoin = await MockERC20Factory.deploy("USD Coin", "USDC", 6);

        // Deploy oracle
        const OracleFactory = await ethers.getContractFactory("CSVOracle");
        oracle = await OracleFactory.deploy(
            governor.address,
            guardian.address,
            [attestor1.address, attestor2.address],
            2
        );

        // Deploy CSV token
        const CSVTokenFactory = await ethers.getContractFactory("ERCRWACSV");
        csvToken = await CSVTokenFactory.deploy(
            "CSV Token",
            "CSV",
            oracle.target,
            governor.address,
            guardian.address
        );

        // Deploy vault
        const VaultFactory = await ethers.getContractFactory("CSVVault");
        vault = await VaultFactory.deploy(
            csvToken.target,
            oracle.target,
            stablecoin.target,
            governor.address,
            guardian.address
        );

        // Setup token with vault
        await csvToken.connect(governor).setVault(vault.target);

        // Setup oracle with initial data
        await setupOracleData(INITIAL_NAV);

        // Mint stablecoins to users
        await stablecoin.mint(user1.address, ethers.parseUnits("10000", 6));
        await stablecoin.mint(user2.address, ethers.parseUnits("10000", 6));
    });

    async function setupOracleData(navPerToken: bigint) {
        const currentTime = await time.latest();
        const oracleData = {
            navPerToken,
            totalSupply: ethers.parseEther("0"),
            utilizationBps: 0,
            ltvBps: 0,
            timestamp: currentTime,
            blockNumber: await ethers.provider.getBlockNumber(),
            dataCID: "QmTestCID123",
            nonce: Math.floor(Math.random() * 1000000)
        };

        const domainSeparator = await oracle.getDomainSeparator();
        const ORACLE_DATA_TYPEHASH = ethers.keccak256(
            ethers.toUtf8Bytes(
                "OracleData(uint256 navPerToken,uint256 totalSupply,uint256 utilizationBps,uint256 ltvBps,uint256 timestamp,uint256 blockNumber,string dataCID,uint256 nonce)"
            )
        );

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

        const sig1 = await signOracleData(attestor1, oracleData);
        const sig2 = await signOracleData(attestor2, oracleData);

        const signatures = [
            { attestor: attestor1.address, signature: sig1 },
            { attestor: attestor2.address, signature: sig2 }
        ];

        await oracle.updateOracleData(oracleData, signatures);
    }

    describe("Deployment", function () {
        it("Should set correct initial values", async function () {
            expect(await vault.csvToken()).to.equal(csvToken.target);
            expect(await vault.oracle()).to.equal(oracle.target);
            expect(await vault.stablecoin()).to.equal(stablecoin.target);
            expect(await vault.carrierConcentrationCapBps()).to.equal(2000); // 20%
            expect(await vault.minVintageMonths()).to.equal(6);
            expect(await vault.maxVintageMonths()).to.equal(120);
        });

        it("Should grant correct roles", async function () {
            const GOVERNOR_ROLE = await vault.GOVERNOR_ROLE();
            const GUARDIAN_ROLE = await vault.GUARDIAN_ROLE();
            
            expect(await vault.hasRole(GOVERNOR_ROLE, governor.address)).to.be.true;
            expect(await vault.hasRole(GUARDIAN_ROLE, guardian.address)).to.be.true;
        });
    });

    describe("Deposits", function () {
        beforeEach(async function () {
            await stablecoin.connect(user1).approve(vault.target, DEPOSIT_AMOUNT);
        });

        it("Should deposit stablecoins and receive CSV tokens", async function () {
            const expectedCsvTokens = ethers.parseEther("1000"); // 1000 USDC / 1.0 NAV

            await expect(vault.connect(user1).deposit(DEPOSIT_AMOUNT, expectedCsvTokens))
                .to.emit(vault, "Deposit")
                .withArgs(user1.address, DEPOSIT_AMOUNT, expectedCsvTokens)
                .to.emit(csvToken, "Mint")
                .withArgs(user1.address, expectedCsvTokens, DEPOSIT_AMOUNT);

            expect(await csvToken.balanceOf(user1.address)).to.equal(expectedCsvTokens);
            expect(await stablecoin.balanceOf(vault.target)).to.equal(DEPOSIT_AMOUNT);
            expect(await vault.totalDeposits()).to.equal(DEPOSIT_AMOUNT);
        });

        it("Should revert with insufficient CSV tokens (slippage protection)", async function () {
            const minCsvTokens = ethers.parseEther("1001"); // More than expected

            await expect(vault.connect(user1).deposit(DEPOSIT_AMOUNT, minCsvTokens))
                .to.be.revertedWithCustomError(vault, "InsufficientCollateral");
        });

        it("Should revert when paused", async function () {
            await vault.connect(guardian).emergencyPause("Testing");

            await expect(vault.connect(user1).deposit(DEPOSIT_AMOUNT, 0))
                .to.be.revertedWithCustomError(vault, "SystemPaused");
        });

        it("Should revert with stale oracle data", async function () {
            // Advance time to make oracle data stale
            await time.increase(3601); // More than 1 hour

            await expect(vault.connect(user1).deposit(DEPOSIT_AMOUNT, 0))
                .to.be.revertedWithCustomError(vault, "StaleOracle");
        });
    });

    describe("Redemptions", function () {
        const depositAmount = ethers.parseUnits("1000", 6);
        const csvAmount = ethers.parseEther("1000");

        beforeEach(async function () {
            // Setup initial deposit
            await stablecoin.connect(user1).approve(vault.target, depositAmount);
            await vault.connect(user1).deposit(depositAmount, csvAmount);
            
            // Approve vault to transfer CSV tokens for redemptions
            await csvToken.connect(user1).approve(vault.target, csvAmount);
        });

        it("Should request redemption", async function () {
            const redeemAmount = ethers.parseEther("500");

            await expect(vault.connect(user1).requestRedemption(redeemAmount))
                .to.emit(vault, "RedemptionRequested")
                .withArgs(user1.address, 0, redeemAmount);

            const request = await vault.redemptionRequests(0);
            expect(request.user).to.equal(user1.address);
            expect(request.amount).to.equal(redeemAmount);
            expect(request.processed).to.be.false;

            expect(await csvToken.balanceOf(vault.target)).to.equal(redeemAmount);
            expect(await vault.totalPendingRedemptions()).to.equal(redeemAmount);
        });

        it("Should process redemption after delay", async function () {
            const redeemAmount = ethers.parseEther("500");
            const expectedStablecoin = ethers.parseUnits("500", 6); // 500 * 1.0 NAV

            // Request redemption
            await vault.connect(user1).requestRedemption(redeemAmount);

            // Advance time past delay
            await time.increase(7 * 24 * 60 * 60 + 1); // 7 days + 1 second

            const initialBalance = await stablecoin.balanceOf(user1.address);

            await expect(vault.connect(user1).processRedemption(0))
                .to.emit(vault, "RedemptionProcessed")
                .withArgs(user1.address, 0, expectedStablecoin);

            const finalBalance = await stablecoin.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.equal(expectedStablecoin);

            const request = await vault.redemptionRequests(0);
            expect(request.processed).to.be.true;
            expect(await vault.totalPendingRedemptions()).to.equal(0);
        });

        it("Should revert redemption processing before delay", async function () {
            const redeemAmount = ethers.parseEther("500");

            await vault.connect(user1).requestRedemption(redeemAmount);

            await expect(vault.connect(user1).processRedemption(0))
                .to.be.revertedWithCustomError(vault, "RedemptionNotReady");
        });

        it("Should revert processing already processed redemption", async function () {
            const redeemAmount = ethers.parseEther("500");

            await vault.connect(user1).requestRedemption(redeemAmount);
            await time.increase(7 * 24 * 60 * 60 + 1);
            await vault.connect(user1).processRedemption(0);

            await expect(vault.connect(user1).processRedemption(0))
                .to.be.revertedWithCustomError(vault, "RedemptionAlreadyProcessed");
        });

        it("Should use lower value for protection against manipulation", async function () {
            const redeemAmount = ethers.parseEther("500");

            // Request redemption at NAV 1.0
            await vault.connect(user1).requestRedemption(redeemAmount);

            // Update oracle with higher NAV
            await setupOracleData(ethers.parseEther("1.5"));

            await time.increase(7 * 24 * 60 * 60 + 1);

            const initialBalance = await stablecoin.balanceOf(user1.address);
            await vault.connect(user1).processRedemption(0);
            const finalBalance = await stablecoin.balanceOf(user1.address);

            // Should use original lower value (500 USDC), not current higher value (750 USDC)
            expect(finalBalance - initialBalance).to.equal(ethers.parseUnits("500", 6));
        });
    });

    describe("Carrier Concentration", function () {
        it("Should update carrier exposure", async function () {
            const ORACLE_ROLE = await vault.ORACLE_ROLE();
            await vault.connect(governor).grantRole(ORACLE_ROLE, attestor1.address);

            await expect(
                vault.connect(attestor1).updateCarrierExposure(
                    "TestCarrier",
                    ethers.parseUnits("1000000", 6), // $1M
                    100
                )
            ).to.emit(vault, "CarrierExposureUpdated")
            .withArgs("TestCarrier", ethers.parseUnits("1000000", 6), 100);

            const exposure = await vault.carrierExposures("TestCarrier");
            expect(exposure.totalValue).to.equal(ethers.parseUnits("1000000", 6));
            expect(exposure.policyCount).to.equal(100);
            expect(exposure.isActive).to.be.true;

            const activeCarriers = await vault.getActiveCarriers();
            expect(activeCarriers).to.include("TestCarrier");
        });

        it("Should check carrier concentration limits", async function () {
            // Set up CSV token with collateral
            await csvToken.connect(governor).emergencyUpdateCollateral(ethers.parseUnits("5000000", 6)); // $5M total

            // Should allow carrier within limit (20% of $5M = $1M)
            expect(await vault.checkCarrierConcentration("TestCarrier", ethers.parseUnits("1000000", 6)))
                .to.be.true;

            // Should reject carrier exceeding limit (25% of $5M = $1.25M)
            expect(await vault.checkCarrierConcentration("TestCarrier", ethers.parseUnits("1250000", 6)))
                .to.be.false;
        });

        it("Should update concentration cap", async function () {
            const newCap = 2500; // 25%

            await expect(vault.connect(governor).updateCarrierConcentrationCap(newCap))
                .to.emit(vault, "ConcentrationCapUpdated")
                .withArgs(2000, newCap);

            expect(await vault.carrierConcentrationCapBps()).to.equal(newCap);
        });
    });

    describe("Vintage Validation", function () {
        it("Should validate vintage ranges", async function () {
            expect(await vault.validateVintage(6)).to.be.true;   // Min valid
            expect(await vault.validateVintage(60)).to.be.true;  // Middle
            expect(await vault.validateVintage(120)).to.be.true; // Max valid
            expect(await vault.validateVintage(5)).to.be.false;  // Below min
            expect(await vault.validateVintage(121)).to.be.false; // Above max
        });

        it("Should update vintage range", async function () {
            const newMin = 12;
            const newMax = 60;

            await expect(vault.connect(governor).updateVintageRange(newMin, newMax))
                .to.emit(vault, "VintageRangeUpdated")
                .withArgs(6, newMin, 120, newMax);

            expect(await vault.minVintageMonths()).to.equal(newMin);
            expect(await vault.maxVintageMonths()).to.equal(newMax);
        });
    });

    describe("Vault Metrics", function () {
        it("Should return correct vault metrics", async function () {
            // Make a deposit first
            await stablecoin.connect(user1).approve(vault.target, DEPOSIT_AMOUNT);
            await vault.connect(user1).deposit(DEPOSIT_AMOUNT, ethers.parseEther("1000"));

            const [totalDeposits, utilizationBps, availableLiquidity, pendingRedemptions] = 
                await vault.getVaultMetrics();

            expect(totalDeposits).to.equal(DEPOSIT_AMOUNT);
            expect(availableLiquidity).to.equal(DEPOSIT_AMOUNT);
            expect(utilizationBps).to.equal(0); // No utilization yet
            expect(pendingRedemptions).to.equal(0);
        });

        it("Should calculate utilization correctly", async function () {
            // Make deposit
            await stablecoin.connect(user1).approve(vault.target, DEPOSIT_AMOUNT);
            await vault.connect(user1).deposit(DEPOSIT_AMOUNT, ethers.parseEther("1000"));

            // Simulate some utilization by transferring stablecoins out
            const utilizationAmount = ethers.parseUnits("400", 6); // 40% utilization
            await stablecoin.transfer(vault.target, utilizationAmount);
            await vault.connect(guardian).emergencyWithdraw(utilizationAmount, governor.address);

            const [, utilizationBps] = await vault.getVaultMetrics();
            expect(utilizationBps).to.equal(4000); // 40%
        });
    });

    describe("Emergency Functions", function () {
        beforeEach(async function () {
            // Setup vault with some deposits
            await stablecoin.connect(user1).approve(vault.target, DEPOSIT_AMOUNT);
            await vault.connect(user1).deposit(DEPOSIT_AMOUNT, ethers.parseEther("1000"));
        });

        it("Should emergency withdraw stablecoins", async function () {
            const withdrawAmount = ethers.parseUnits("500", 6);
            const initialBalance = await stablecoin.balanceOf(governor.address);

            await vault.connect(guardian).emergencyWithdraw(withdrawAmount, governor.address);

            const finalBalance = await stablecoin.balanceOf(governor.address);
            expect(finalBalance - initialBalance).to.equal(withdrawAmount);
        });

        it("Should revert emergency withdraw from non-guardian", async function () {
            await expect(
                vault.connect(user1).emergencyWithdraw(ethers.parseUnits("100", 6), user1.address)
            ).to.be.revertedWithCustomError(vault, "UnauthorizedRole");
        });
    });

    describe("Access Control", function () {
        it("Should revert governance functions from non-governor", async function () {
            await expect(vault.connect(user1).updateCarrierConcentrationCap(2500))
                .to.be.revertedWithCustomError(vault, "UnauthorizedRole");

            await expect(vault.connect(user1).updateVintageRange(12, 60))
                .to.be.revertedWithCustomError(vault, "UnauthorizedRole");
        });

        it("Should revert oracle functions from non-oracle", async function () {
            await expect(
                vault.connect(user1).updateCarrierExposure("TestCarrier", 1000000, 100)
            ).to.be.revertedWithCustomError(vault, "UnauthorizedRole");
        });
    });
});
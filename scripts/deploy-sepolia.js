const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("🚀 Deploying iYield Protocol to Sepolia...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  // Deploy contracts in dependency order
  const deployedContracts = {};
  
  try {
    // 1. Deploy Oracle first
    console.log("\n📊 Deploying CSVOracle...");
    const CSVOracle = await ethers.getContractFactory("CSVOracle");
    const oracle = await upgrades.deployProxy(CSVOracle, [
      deployer.address, // governor (temporary, will be Safe)
      deployer.address, // guardian (temporary, will be Safe)
      [deployer.address], // initial attestor
      1 // threshold (1-of-1 for testing)
    ], { kind: 'uups' });
    
    await oracle.waitForDeployment();
    deployedContracts.oracle = await oracle.getAddress();
    console.log("✅ CSVOracle deployed to:", deployedContracts.oracle);

    // 2. Deploy CSV Token
    console.log("\n🪙 Deploying ERCRWACSV...");
    const ERCRWACSV = await ethers.getContractFactory("ERCRWACSV");
    const csvToken = await upgrades.deployProxy(ERCRWACSV, [
      "iYield CSV Token",
      "CSV",
      deployedContracts.oracle,
      deployer.address, // governor
      deployer.address  // guardian
    ], { kind: 'uups' });
    
    await csvToken.waitForDeployment();
    deployedContracts.csvToken = await csvToken.getAddress();
    console.log("✅ ERCRWACSV deployed to:", deployedContracts.csvToken);

    // 3. Deploy Mock Stablecoin for testing
    console.log("\n💰 Deploying Mock USDC...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await usdc.waitForDeployment();
    deployedContracts.usdc = await usdc.getAddress();
    console.log("✅ Mock USDC deployed to:", deployedContracts.usdc);

    // 4. Deploy Vault
    console.log("\n🏦 Deploying CSVVault...");
    const CSVVault = await ethers.getContractFactory("CSVVault");
    const vault = await upgrades.deployProxy(CSVVault, [
      deployedContracts.csvToken,
      deployedContracts.oracle,
      deployedContracts.usdc,
      deployer.address, // governor
      deployer.address  // guardian
    ], { kind: 'uups' });
    
    await vault.waitForDeployment();
    deployedContracts.vault = await vault.getAddress();
    console.log("✅ CSVVault deployed to:", deployedContracts.vault);

    // 5. Wire up the contracts
    console.log("\n🔗 Wiring up contracts...");
    
    // Set vault in CSV token
    await csvToken.setVault(deployedContracts.vault);
    console.log("✅ Vault set in CSV token");
    
    // Mint some test USDC to deployer
    await usdc.mint(deployer.address, ethers.parseUnits("10000", 6)); // 10k USDC
    console.log("✅ Minted 10,000 test USDC to deployer");

    // 6. Setup initial oracle data
    console.log("\n📈 Setting up initial oracle data...");
    const currentTime = Math.floor(Date.now() / 1000);
    const oracleData = {
      navPerToken: ethers.parseEther("1.0"), // $1.00 NAV
      totalSupply: ethers.parseEther("0"),
      utilizationBps: 0,
      ltvBps: 0,
      timestamp: currentTime,
      blockNumber: await ethers.provider.getBlockNumber(),
      dataCID: "QmTestInitialData123",
      nonce: 1
    };

    // Create test oracle update (single signature for testing)
    const domain = {
      name: "CSVOracle",
      version: "1",
      chainId: 11155111, // Sepolia
      verifyingContract: deployedContracts.oracle
    };

    const types = {
      OracleData: [
        { name: "navPerToken", type: "uint256" },
        { name: "totalSupply", type: "uint256" },
        { name: "utilizationBps", type: "uint256" },
        { name: "ltvBps", type: "uint256" },
        { name: "timestamp", type: "uint256" },
        { name: "blockNumber", type: "uint256" },
        { name: "dataCID", type: "string" },
        { name: "nonce", type: "uint256" }
      ]
    };

    const signature = await deployer.signTypedData(domain, types, oracleData);
    
    const signatures = [
      { attestor: deployer.address, signature }
    ];

    await oracle.updateOracleData(oracleData, signatures);
    console.log("✅ Initial oracle data set");

    // 7. Output deployment info
    console.log("\n🎉 Deployment Complete!");
    console.log("==========================================");
    console.log("Network: Sepolia");
    console.log("Deployer:", deployer.address);
    console.log("==========================================");
    console.log("📊 CSVOracle:", deployedContracts.oracle);
    console.log("🪙 ERCRWACSV:", deployedContracts.csvToken);
    console.log("🏦 CSVVault:", deployedContracts.vault);
    console.log("💰 Mock USDC:", deployedContracts.usdc);
    console.log("==========================================");

    // Save addresses to file
    const fs = require('fs');
    const deploymentData = {
      network: "sepolia",
      chainId: 11155111,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: deployedContracts,
      verification: {
        oracle: `npx hardhat verify --network sepolia ${deployedContracts.oracle}`,
        csvToken: `npx hardhat verify --network sepolia ${deployedContracts.csvToken}`,
        vault: `npx hardhat verify --network sepolia ${deployedContracts.vault}`,
        usdc: `npx hardhat verify --network sepolia ${deployedContracts.usdc} "Mock USDC" "USDC" 6`
      }
    };

    fs.writeFileSync('deployments-sepolia.json', JSON.stringify(deploymentData, null, 2));
    console.log("📄 Deployment addresses saved to deployments-sepolia.json");

    // Update frontend env
    const frontendEnv = `
# Sepolia Deployment - Generated ${new Date().toISOString()}
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
NEXT_PUBLIC_CSV_ORACLE_ADDRESS=${deployedContracts.oracle}
NEXT_PUBLIC_CSV_TOKEN_ADDRESS=${deployedContracts.csvToken}
NEXT_PUBLIC_CSV_VAULT_ADDRESS=${deployedContracts.vault}
NEXT_PUBLIC_MOCK_USDC_ADDRESS=${deployedContracts.usdc}
`;

    fs.writeFileSync('frontend/.env.local', frontendEnv);
    console.log("📄 Frontend environment updated");

    console.log("\n🔥 Ready for testing!");
    console.log("Next steps:");
    console.log("1. Verify contracts: npm run verify:sepolia");
    console.log("2. Start frontend: cd frontend && npm run dev");
    console.log("3. Get Sepolia ETH: https://sepoliafaucet.com");
    console.log("4. Test with MetaMask on Sepolia network");

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
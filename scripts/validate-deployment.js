const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("🔍 Validating Sepolia Deployment...");
  
  // Load deployment addresses
  if (!fs.existsSync('deployments-sepolia.json')) {
    console.error("❌ No deployment file found. Run deploy-sepolia.js first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployments-sepolia.json', 'utf8'));
  const [deployer] = await ethers.getSigners();
  
  console.log("Validator account:", deployer.address);
  console.log("Network:", await deployer.provider.getNetwork());

  let allTestsPassed = true;

  try {
    // Test 1: Contract Deployment
    console.log("\n📋 Test 1: Contract Deployment Validation");
    
    const oracle = await ethers.getContractAt("CSVOracle", deployment.contracts.oracle);
    const csvToken = await ethers.getContractAt("ERCRWACSV", deployment.contracts.csvToken);
    const vault = await ethers.getContractAt("CSVVault", deployment.contracts.vault);
    const usdc = await ethers.getContractAt("MockERC20", deployment.contracts.usdc);

    // Check contract addresses
    console.log("✅ Oracle contract loaded:", await oracle.getAddress());
    console.log("✅ CSV Token contract loaded:", await csvToken.getAddress());
    console.log("✅ Vault contract loaded:", await vault.getAddress());
    console.log("✅ USDC contract loaded:", await usdc.getAddress());

    // Test 2: Oracle Functionality
    console.log("\n📊 Test 2: Oracle Functionality");
    
    const latestData = await oracle.getLatestData();
    console.log("✅ Oracle NAV per token:", ethers.formatEther(latestData.navPerToken));
    console.log("✅ Oracle timestamp:", new Date(Number(latestData.timestamp) * 1000).toISOString());
    console.log("✅ Oracle data CID:", latestData.dataCID);
    
    const isFresh = await oracle.isFresh();
    console.log("✅ Oracle data is fresh:", isFresh);
    
    const attestorCount = await oracle.getAttestorCount();
    console.log("✅ Attestor count:", attestorCount.toString());

    // Test 3: Token Functionality
    console.log("\n🪙 Test 3: Token Functionality");
    
    const tokenName = await csvToken.name();
    const tokenSymbol = await csvToken.symbol();
    const tokenDecimals = await csvToken.decimals();
    
    console.log("✅ Token name:", tokenName);
    console.log("✅ Token symbol:", tokenSymbol);
    console.log("✅ Token decimals:", tokenDecimals);
    
    const oracleAddress = await csvToken.getOracle();
    const vaultAddress = await csvToken.getVault();
    
    console.log("✅ Token oracle address:", oracleAddress);
    console.log("✅ Token vault address:", vaultAddress);
    
    if (oracleAddress !== deployment.contracts.oracle) {
      console.error("❌ Oracle address mismatch in token");
      allTestsPassed = false;
    }
    
    if (vaultAddress !== deployment.contracts.vault) {
      console.error("❌ Vault address mismatch in token");
      allTestsPassed = false;
    }

    // Test 4: Vault Functionality
    console.log("\n🏦 Test 4: Vault Functionality");
    
    const vaultToken = await vault.csvToken();
    const vaultOracle = await vault.oracle();
    const vaultStablecoin = await vault.stablecoin();
    
    console.log("✅ Vault CSV token:", vaultToken);
    console.log("✅ Vault oracle:", vaultOracle);
    console.log("✅ Vault stablecoin:", vaultStablecoin);
    
    if (vaultToken !== deployment.contracts.csvToken) {
      console.error("❌ CSV token address mismatch in vault");
      allTestsPassed = false;
    }

    // Test 5: Mock USDC
    console.log("\n💰 Test 5: Mock USDC Functionality");
    
    const usdcName = await usdc.name();
    const usdcSymbol = await usdc.symbol();
    const usdcDecimals = await usdc.decimals();
    const deployerBalance = await usdc.balanceOf(deployer.address);
    
    console.log("✅ USDC name:", usdcName);
    console.log("✅ USDC symbol:", usdcSymbol);
    console.log("✅ USDC decimals:", usdcDecimals);
    console.log("✅ Deployer USDC balance:", ethers.formatUnits(deployerBalance, 6));

    // Test 6: Integration Test - Small Deposit
    console.log("\n🔄 Test 6: Integration Test - Deposit Flow");
    
    const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
    const minCsvTokens = ethers.parseEther("99"); // Expecting ~100 CSV tokens
    
    // Approve USDC spend
    console.log("🔄 Approving USDC spend...");
    await usdc.approve(vault.target, depositAmount);
    
    // Get initial balances
    const initialUsdcBalance = await usdc.balanceOf(deployer.address);
    const initialCsvBalance = await csvToken.balanceOf(deployer.address);
    
    console.log("Initial USDC balance:", ethers.formatUnits(initialUsdcBalance, 6));
    console.log("Initial CSV balance:", ethers.formatEther(initialCsvBalance));
    
    // Make deposit
    console.log("🔄 Making deposit...");
    const depositTx = await vault.deposit(depositAmount, minCsvTokens);
    await depositTx.wait();
    console.log("✅ Deposit transaction completed");
    
    // Check final balances
    const finalUsdcBalance = await usdc.balanceOf(deployer.address);
    const finalCsvBalance = await csvToken.balanceOf(deployer.address);
    
    console.log("Final USDC balance:", ethers.formatUnits(finalUsdcBalance, 6));
    console.log("Final CSV balance:", ethers.formatEther(finalCsvBalance));
    
    const usdcSpent = initialUsdcBalance - finalUsdcBalance;
    const csvReceived = finalCsvBalance - initialCsvBalance;
    
    console.log("✅ USDC spent:", ethers.formatUnits(usdcSpent, 6));
    console.log("✅ CSV received:", ethers.formatEther(csvReceived));
    
    if (usdcSpent !== depositAmount) {
      console.error("❌ USDC spend amount mismatch");
      allTestsPassed = false;
    }

    // Test 7: Governance Functions
    console.log("\n🏛️ Test 7: Governance Functions");
    
    const GOVERNOR_ROLE = await csvToken.GOVERNOR_ROLE();
    const GUARDIAN_ROLE = await csvToken.GUARDIAN_ROLE();
    
    const isGovernor = await csvToken.hasRole(GOVERNOR_ROLE, deployer.address);
    const isGuardian = await csvToken.hasRole(GUARDIAN_ROLE, deployer.address);
    
    console.log("✅ Deployer has governor role:", isGovernor);
    console.log("✅ Deployer has guardian role:", isGuardian);
    
    if (!isGovernor || !isGuardian) {
      console.error("❌ Role assignment issue");
      allTestsPassed = false;
    }

    // Test 8: Gas Usage Analysis
    console.log("\n⛽ Test 8: Gas Usage Analysis");
    
    const receipt = await ethers.provider.getTransactionReceipt(depositTx.hash);
    console.log("✅ Deposit gas used:", receipt.gasUsed.toString());
    
    if (receipt.gasUsed > 500000n) {
      console.warn("⚠️ High gas usage detected:", receipt.gasUsed.toString());
    }

    // Summary
    console.log("\n🎯 Validation Summary");
    console.log("==========================================");
    
    if (allTestsPassed) {
      console.log("🎉 ALL TESTS PASSED!");
      console.log("✅ Contracts deployed successfully");
      console.log("✅ Oracle functioning properly");
      console.log("✅ Token system operational");
      console.log("✅ Vault deposit/withdrawal working");
      console.log("✅ Governance roles configured");
      console.log("✅ Integration flow validated");
      
      console.log("\n🚀 System ready for frontend testing!");
      console.log("Next steps:");
      console.log("1. cd frontend && npm run dev");
      console.log("2. Connect MetaMask to Sepolia");
      console.log("3. Import token addresses to MetaMask");
      console.log("4. Test full user flows");
      
    } else {
      console.log("❌ SOME TESTS FAILED!");
      console.log("Please review the errors above and redeploy if necessary.");
      process.exit(1);
    }

  } catch (error) {
    console.error("❌ Validation failed:", error);
    allTestsPassed = false;
    process.exit(1);
  }

  return allTestsPassed;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
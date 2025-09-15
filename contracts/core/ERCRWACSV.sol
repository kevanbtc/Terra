// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "../interfaces/IERCRWACSV.sol";
import "../interfaces/ICSVOracle.sol";
import "./GovControlled.sol";

/**
 * @title ERCRWACSV
 * @dev ERC20 token representing CSV (Captive Securities Vehicle) shares
 * @notice Token backed by insurance portfolio with oracle-verified NAV
 */
contract ERCRWACSV is IERCRWACSV, ERC20, ERC20Permit, GovControlled {
    /**
     * @dev Token configuration
     */
    uint256 public constant MAX_LTV_BPS = 8000; // 80% max LTV
    uint256 public constant STALE_THRESHOLD = 2 hours;
    
    /**
     * @dev State variables
     */
    ICSVOracle public immutable oracle;
    address public vault;
    uint256 public totalCollateralValue;
    uint256 public ltvCapBps; // Current LTV cap in basis points
    
    /**
     * @dev Compliance integration
     */
    address public complianceRegistry;
    
    /**
     * @dev Events
     */
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event LTVCapUpdated(uint256 oldCap, uint256 newCap);
    event ComplianceRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    /**
     * @dev Constructor
     * @param name Token name
     * @param symbol Token symbol
     * @param oracle_ Oracle contract address
     * @param governor Governor address (Gnosis Safe)
     * @param guardian Guardian address (Gnosis Safe)
     */
    constructor(
        string memory name,
        string memory symbol,
        address oracle_,
        address governor,
        address guardian
    ) 
        ERC20(name, symbol)
        ERC20Permit(name)
        GovControlled(governor, guardian)
    {
        _validateAddress(oracle_);
        oracle = ICSVOracle(oracle_);
        ltvCapBps = 7000; // Default 70% LTV cap
        
        emit LTVCapUpdated(0, ltvCapBps);
    }

    /**
     * @dev Set vault address (governor only)
     * @param newVault New vault contract address
     */
    function setVault(address newVault) external onlyGovernor {
        _validateAddress(newVault);
        
        address oldVault = vault;
        vault = newVault;
        
        // Grant minting role to vault
        _grantRole(OPERATOR_ROLE, newVault);
        if (oldVault != address(0)) {
            _revokeRole(OPERATOR_ROLE, oldVault);
        }
        
        emit VaultUpdated(oldVault, newVault);
    }

    /**
     * @dev Set compliance registry (governor only)
     * @param newRegistry New compliance registry address
     */
    function setComplianceRegistry(address newRegistry) external onlyGovernor {
        address oldRegistry = complianceRegistry;
        complianceRegistry = newRegistry;
        emit ComplianceRegistryUpdated(oldRegistry, newRegistry);
    }

    /**
     * @dev Update LTV cap (governor only)
     * @param newCapBps New LTV cap in basis points
     */
    function updateLTVCap(uint256 newCapBps) external onlyGovernor {
        _validateBasisPoints(newCapBps);
        if (newCapBps > MAX_LTV_BPS) revert InvalidAmount();
        
        uint256 oldCap = ltvCapBps;
        ltvCapBps = newCapBps;
        
        _updateParameter("ltvCapBps", oldCap, newCapBps);
        emit LTVCapUpdated(oldCap, newCapBps);
    }

    /**
     * @dev Mint tokens backed by collateral (vault only)
     * @param to Address to mint to
     * @param amount Amount to mint
     * @param collateralValue USD value of backing collateral
     */
    function mint(address to, uint256 amount, uint256 collateralValue) 
        external 
        onlyOperator 
        nonReentrant 
        whenNotPausedWithReason 
    {
        _validateAddress(to);
        _validateAmount(amount);
        _validateAmount(collateralValue);

        // Check oracle freshness
        (uint256 navPerToken, bool isStale) = oracle.getNavPerToken();
        if (isStale) revert StaleOracle();

        // Calculate expected collateral based on NAV
        uint256 expectedCollateral = (amount * navPerToken) / 1e18;
        
        // Update total collateral
        totalCollateralValue += collateralValue;
        
        // Check LTV ratio after minting
        uint256 newSupply = totalSupply() + amount;
        uint256 newLTV = (newSupply * navPerToken * 10000) / (totalCollateralValue * 1e18);
        
        if (newLTV > ltvCapBps) revert ExcessiveConcentration();

        // Mint tokens
        _mint(to, amount);
        
        emit Mint(to, amount, collateralValue);
    }

    /**
     * @dev Burn tokens and release collateral (vault only)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) 
        external 
        onlyOperator 
        nonReentrant 
        whenNotPausedWithReason 
    {
        _validateAddress(from);
        _validateAmount(amount);

        // Check oracle freshness
        (uint256 navPerToken, bool isStale) = oracle.getNavPerToken();
        if (isStale) revert StaleOracle();

        // Calculate collateral to release
        uint256 collateralValue = (amount * navPerToken) / 1e18;
        
        // Update total collateral (ensure it doesn't underflow)
        if (totalCollateralValue < collateralValue) {
            totalCollateralValue = 0;
        } else {
            totalCollateralValue -= collateralValue;
        }

        // Burn tokens
        _burn(from, amount);
        
        emit Burn(from, amount, collateralValue);
    }

    /**
     * @dev Get NAV per token from oracle
     * @return navPerToken Current NAV per token
     */
    function getNavPerToken() external view returns (uint256 navPerToken) {
        (navPerToken,) = oracle.getNavPerToken();
    }

    /**
     * @dev Get total collateral value
     * @return Total USD value of backing collateral
     */
    function getTotalCollateral() external view returns (uint256) {
        return totalCollateralValue;
    }

    /**
     * @dev Get current LTV ratio
     * @return Current LTV in basis points
     */
    function getCurrentLTV() external view returns (uint256) {
        if (totalSupply() == 0 || totalCollateralValue == 0) {
            return 0;
        }
        
        (uint256 navPerToken,) = oracle.getNavPerToken();
        return (totalSupply() * navPerToken * 10000) / (totalCollateralValue * 1e18);
    }

    /**
     * @dev Check if transfer is compliant
     * @param from Sender address
     * @param to Recipient address
     * @param amount Transfer amount
     * @return allowed Whether transfer is allowed
     * @return reason Reason if blocked
     */
    function canTransfer(address from, address to, uint256 amount) 
        external 
        view 
        returns (bool allowed, string memory reason) 
    {
        // Check if system is paused
        if (paused()) {
            return (false, "System paused");
        }

        // Check compliance registry if set
        if (complianceRegistry != address(0)) {
            // This would integrate with compliance contract
            // For now, return true (implement compliance logic here)
        }

        // Check oracle staleness for large transfers
        if (amount > totalSupply() / 100) { // >1% of supply
            (, bool isStale) = oracle.getNavPerToken();
            if (isStale) {
                return (false, "Oracle data stale");
            }
        }

        return (true, "");
    }

    /**
     * @dev Override transfer to include compliance checks
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) 
        internal 
        override
        whenNotPausedWithReason
    {
        // Skip checks for mint/burn operations
        if (from == address(0) || to == address(0)) {
            return;
        }

        // Check compliance
        (bool allowed, string memory reason) = this.canTransfer(from, to, amount);
        if (!allowed) {
            emit ComplianceViolation(from, reason);
            revert TransferBlocked(from, to, reason);
        }
    }

    /**
     * @dev Get token decimals (18)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /**
     * @dev Get oracle address
     */
    function getOracle() external view returns (address) {
        return address(oracle);
    }

    /**
     * @dev Get vault address
     */
    function getVault() external view returns (address) {
        return vault;
    }

    /**
     * @dev Get LTV cap
     */
    function getLTVCap() external view returns (uint256) {
        return ltvCapBps;
    }

    /**
     * @dev Emergency function to update collateral value (guardian only)
     * Used in case of oracle failure or major discrepancies
     * @param newCollateralValue New collateral value
     */
    function emergencyUpdateCollateral(uint256 newCollateralValue) external onlyGuardian {
        uint256 oldValue = totalCollateralValue;
        totalCollateralValue = newCollateralValue;
        _updateParameter("totalCollateralValue", oldValue, newCollateralValue);
    }
}
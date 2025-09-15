// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IERCRWACSV
 * @dev Interface for ERC20 token representing CSV (Captive Securities Vehicle) shares
 * @notice This token represents fractional ownership of insurance-backed real world assets
 */
interface IERCRWACSV is IERC20 {
    /**
     * @dev Custom errors for gas efficiency
     */
    error TransferBlocked(address from, address to, string reason);
    error InsufficientCollateral();
    error ExcessiveConcentration();
    error StaleOracle();
    error UnauthorizedMinter();
    error ZeroAddress();
    error InvalidAmount();

    /**
     * @dev Events for monitoring and compliance
     */
    event Mint(address indexed to, uint256 amount, uint256 collateralValue);
    event Burn(address indexed from, uint256 amount, uint256 collateralValue);
    event ComplianceViolation(address indexed account, string reason);
    event OracleUpdated(address indexed oracle, uint256 timestamp);
    event LTVUpdated(uint256 oldLTV, uint256 newLTV);

    /**
     * @dev Mint new tokens backed by collateral
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param collateralValue USD value of backing collateral
     */
    function mint(address to, uint256 amount, uint256 collateralValue) external;

    /**
     * @dev Burn tokens and release collateral
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external;

    /**
     * @dev Get current NAV per token from oracle
     * @return NAV per token in USD (18 decimals)
     */
    function getNavPerToken() external view returns (uint256);

    /**
     * @dev Get total collateral value
     * @return Total USD value of backing collateral
     */
    function getTotalCollateral() external view returns (uint256);

    /**
     * @dev Get current LTV ratio in basis points
     * @return LTV ratio (10000 = 100%)
     */
    function getCurrentLTV() external view returns (uint256);

    /**
     * @dev Check if transfer is allowed under compliance rules
     * @param from Address sending tokens
     * @param to Address receiving tokens
     * @param amount Amount to transfer
     * @return allowed Whether transfer is permitted
     * @return reason Reason if blocked
     */
    function canTransfer(address from, address to, uint256 amount) 
        external view returns (bool allowed, string memory reason);
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GovControlled
 * @dev Base contract providing governance, roles, and emergency controls
 * @notice Implements multi-role governance with pause functionality and Safe integration
 */
abstract contract GovControlled is AccessControl, Pausable, ReentrancyGuard {
    /**
     * @dev Role definitions
     */
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /**
     * @dev Custom errors
     */
    error ZeroAddress();
    error UnauthorizedRole();
    error SystemPaused();
    error InvalidParameter();

    /**
     * @dev Events
     */
    event RoleGrantedToSafe(bytes32 indexed role, address indexed safe);
    event RoleRevokedFromSafe(bytes32 indexed role, address indexed safe);
    event EmergencyPause(address indexed guardian, string reason);
    event EmergencyUnpause(address indexed governor);
    event ParameterUpdated(string indexed parameter, uint256 oldValue, uint256 newValue);

    /**
     * @dev Constructor sets up initial roles
     * @param governor Address with governor role (typically Gnosis Safe)
     * @param guardian Address with guardian role (typically Gnosis Safe)
     */
    constructor(address governor, address guardian) {
        if (governor == address(0) || guardian == address(0)) {
            revert ZeroAddress();
        }

        // Grant roles to multisig addresses
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GOVERNOR_ROLE, governor);
        _grantRole(GUARDIAN_ROLE, guardian);

        // Governor can manage all roles
        _setRoleAdmin(GUARDIAN_ROLE, GOVERNOR_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, GOVERNOR_ROLE);
        _setRoleAdmin(ORACLE_ROLE, GOVERNOR_ROLE);

        emit RoleGrantedToSafe(GOVERNOR_ROLE, governor);
        emit RoleGrantedToSafe(GUARDIAN_ROLE, guardian);
    }

    /**
     * @dev Modifier to check if system is not paused
     */
    modifier whenNotPausedWithReason() {
        if (paused()) {
            revert SystemPaused();
        }
        _;
    }

    /**
     * @dev Modifier for governor-only functions
     */
    modifier onlyGovernor() {
        if (!hasRole(GOVERNOR_ROLE, msg.sender)) {
            revert UnauthorizedRole();
        }
        _;
    }

    /**
     * @dev Modifier for guardian-only functions
     */
    modifier onlyGuardian() {
        if (!hasRole(GUARDIAN_ROLE, msg.sender)) {
            revert UnauthorizedRole();
        }
        _;
    }

    /**
     * @dev Modifier for operator-only functions
     */
    modifier onlyOperator() {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) {
            revert UnauthorizedRole();
        }
        _;
    }

    /**
     * @dev Modifier for oracle-only functions
     */
    modifier onlyOracle() {
        if (!hasRole(ORACLE_ROLE, msg.sender)) {
            revert UnauthorizedRole();
        }
        _;
    }

    /**
     * @dev Emergency pause function (guardian only)
     * @param reason Reason for pausing
     */
    function emergencyPause(string calldata reason) external onlyGuardian {
        _pause();
        emit EmergencyPause(msg.sender, reason);
    }

    /**
     * @dev Unpause function (governor only)
     */
    function unpause() external onlyGovernor {
        _unpause();
        emit EmergencyUnpause(msg.sender);
    }

    /**
     * @dev Grant role to Safe multisig
     * @param role Role to grant
     * @param safe Safe address to grant role to
     */
    function grantRoleToSafe(bytes32 role, address safe) external onlyGovernor {
        if (safe == address(0)) {
            revert ZeroAddress();
        }
        
        _grantRole(role, safe);
        emit RoleGrantedToSafe(role, safe);
    }

    /**
     * @dev Revoke role from Safe multisig
     * @param role Role to revoke
     * @param safe Safe address to revoke role from
     */
    function revokeRoleFromSafe(bytes32 role, address safe) external onlyGovernor {
        _revokeRole(role, safe);
        emit RoleRevokedFromSafe(role, safe);
    }

    /**
     * @dev Update a parameter with governance approval
     * @param parameter Name of parameter being updated
     * @param oldValue Previous value
     * @param newValue New value
     */
    function _updateParameter(string memory parameter, uint256 oldValue, uint256 newValue) 
        internal 
        onlyGovernor 
    {
        emit ParameterUpdated(parameter, oldValue, newValue);
    }

    /**
     * @dev Validate address is not zero
     * @param addr Address to validate
     */
    function _validateAddress(address addr) internal pure {
        if (addr == address(0)) {
            revert ZeroAddress();
        }
    }

    /**
     * @dev Validate amount is greater than zero
     * @param amount Amount to validate
     */
    function _validateAmount(uint256 amount) internal pure {
        if (amount == 0) {
            revert InvalidParameter();
        }
    }

    /**
     * @dev Validate basis points (must be <= 10000)
     * @param bps Basis points to validate
     */
    function _validateBasisPoints(uint256 bps) internal pure {
        if (bps > 10000) {
            revert InvalidParameter();
        }
    }

    /**
     * @dev Get current pause status
     * @return isPaused Whether contract is paused
     */
    function isPaused() external view returns (bool isPaused) {
        return paused();
    }

    /**
     * @dev Check if address has governor role
     * @param account Address to check
     * @return hasGovernorRole Whether address has governor role
     */
    function isGovernor(address account) external view returns (bool hasGovernorRole) {
        return hasRole(GOVERNOR_ROLE, account);
    }

    /**
     * @dev Check if address has guardian role
     * @param account Address to check
     * @return hasGuardianRole Whether address has guardian role
     */
    function isGuardian(address account) external view returns (bool hasGuardianRole) {
        return hasRole(GUARDIAN_ROLE, account);
    }

    /**
     * @dev Check if address has operator role
     * @param account Address to check
     * @return hasOperatorRole Whether address has operator role
     */
    function isOperator(address account) external view returns (bool hasOperatorRole) {
        return hasRole(OPERATOR_ROLE, account);
    }

    /**
     * @dev Check if address has oracle role
     * @param account Address to check
     * @return hasOracleRole Whether address has oracle role
     */
    function isOracle(address account) external view returns (bool hasOracleRole) {
        return hasRole(ORACLE_ROLE, account);
    }
}
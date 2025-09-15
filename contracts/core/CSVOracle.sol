// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ICSVOracle.sol";
import "./GovControlled.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title CSVOracle
 * @dev Oracle contract for CSV portfolio data with multi-attestor verification
 * @notice Provides NAV and portfolio metrics with cryptographic proof from multiple attestors
 */
contract CSVOracle is ICSVOracle, GovControlled, EIP712 {
    using ECDSA for bytes32;

    /**
     * @dev Oracle configuration
     */
    uint256 public constant MAX_ATTESTORS = 10;
    uint256 public constant MIN_THRESHOLD = 1;
    uint256 public constant MAX_FRESHNESS_TIMEOUT = 24 hours;
    uint256 public constant MIN_FRESHNESS_TIMEOUT = 5 minutes;

    /**
     * @dev State variables
     */
    OracleData private _latestData;
    mapping(address => bool) private _attestors;
    mapping(uint256 => bool) private _usedNonces;
    address[] private _attestorList;
    uint256 private _threshold;
    uint256 private _freshnessTimeout;

    /**
     * @dev Type hash for EIP-712 signature verification
     */
    bytes32 private constant ORACLE_DATA_TYPEHASH = keccak256(
        "OracleData(uint256 navPerToken,uint256 totalSupply,uint256 utilizationBps,uint256 ltvBps,uint256 timestamp,uint256 blockNumber,string dataCID,uint256 nonce)"
    );

    /**
     * @dev Constructor
     * @param governor Address with governor role
     * @param guardian Address with guardian role
     * @param initialAttestors Array of initial attestor addresses
     * @param threshold Minimum signatures required (2-of-N)
     */
    constructor(
        address governor,
        address guardian,
        address[] memory initialAttestors,
        uint256 threshold
    ) 
        GovControlled(governor, guardian)
        EIP712("CSVOracle", "1")
    {
        if (initialAttestors.length == 0) revert ZeroAddress();
        if (threshold < MIN_THRESHOLD || threshold > initialAttestors.length) {
            revert InvalidParameter();
        }

        _threshold = threshold;
        _freshnessTimeout = 1 hours; // Default 1 hour freshness

        // Add initial attestors
        for (uint256 i = 0; i < initialAttestors.length; i++) {
            _addAttestor(initialAttestors[i]);
        }

        emit ThresholdUpdated(0, threshold);
        emit FreshnessTimeoutUpdated(0, _freshnessTimeout);
    }

    /**
     * @dev Submit oracle data with attestor signatures
     * @param data Oracle data structure
     * @param signatures Array of attestor signatures
     */
    function updateOracleData(
        OracleData calldata data,
        AttestorSignature[] calldata signatures
    ) external nonReentrant whenNotPausedWithReason {
        // Validate data
        if (data.timestamp > block.timestamp) revert InvalidParameter();
        if (data.timestamp < block.timestamp - _freshnessTimeout) revert StaleData();
        if (data.navPerToken == 0) revert InvalidParameter();
        if (_usedNonces[data.nonce]) revert InvalidNonce();
        if (signatures.length < _threshold) revert InsufficientAttestors();

        // Verify signatures
        bytes32 structHash = keccak256(abi.encode(
            ORACLE_DATA_TYPEHASH,
            data.navPerToken,
            data.totalSupply,
            data.utilizationBps,
            data.ltvBps,
            data.timestamp,
            data.blockNumber,
            keccak256(bytes(data.dataCID)),
            data.nonce
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        uint256 validSignatures = 0;
        address lastSigner = address(0);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = hash.recover(signatures[i].signature);
            
            // Ensure no duplicate signers and attestor is valid
            if (signer <= lastSigner) revert InvalidSignature();
            if (!_attestors[signer]) revert UnauthorizedAttestor();
            
            lastSigner = signer;
            validSignatures++;
            
            // Break early if we have enough signatures
            if (validSignatures >= _threshold) {
                break;
            }
        }

        if (validSignatures < _threshold) {
            revert InsufficientAttestors();
        }

        // Mark nonce as used and update data
        _usedNonces[data.nonce] = true;
        _latestData = data;

        emit OracleDataUpdated(
            data.timestamp,
            data.navPerToken,
            data.dataCID,
            data.nonce
        );
    }

    /**
     * @dev Get latest oracle data
     * @return data Latest verified oracle data
     */
    function getLatestData() external view returns (OracleData memory data) {
        return _latestData;
    }

    /**
     * @dev Get NAV per token with staleness check
     * @return navPerToken Current NAV per token
     * @return isStale Whether data is stale
     */
    function getNavPerToken() external view returns (uint256 navPerToken, bool isStale) {
        navPerToken = _latestData.navPerToken;
        isStale = !isFresh();
    }

    /**
     * @dev Check if oracle data is fresh
     * @return fresh Whether data is within freshness threshold
     */
    function isFresh() public view returns (bool fresh) {
        if (_latestData.timestamp == 0) return false;
        return (block.timestamp - _latestData.timestamp) <= _freshnessTimeout;
    }

    /**
     * @dev Add new attestor (governor only)
     * @param attestor Address of new attestor
     */
    function addAttestor(address attestor) external onlyGovernor {
        _addAttestor(attestor);
    }

    /**
     * @dev Remove attestor (governor only)
     * @param attestor Address of attestor to remove
     */
    function removeAttestor(address attestor) external onlyGovernor {
        if (!_attestors[attestor]) revert UnauthorizedAttestor();
        
        _attestors[attestor] = false;
        
        // Remove from attestor list
        for (uint256 i = 0; i < _attestorList.length; i++) {
            if (_attestorList[i] == attestor) {
                _attestorList[i] = _attestorList[_attestorList.length - 1];
                _attestorList.pop();
                break;
            }
        }

        // Ensure threshold is still valid
        if (_threshold > _attestorList.length) {
            _threshold = _attestorList.length;
            emit ThresholdUpdated(_threshold + 1, _threshold);
        }

        emit AttestorRemoved(attestor);
    }

    /**
     * @dev Update signature threshold (governor only)
     * @param newThreshold New threshold value
     */
    function updateThreshold(uint256 newThreshold) external onlyGovernor {
        if (newThreshold < MIN_THRESHOLD || newThreshold > _attestorList.length) {
            revert InvalidParameter();
        }

        uint256 oldThreshold = _threshold;
        _threshold = newThreshold;
        emit ThresholdUpdated(oldThreshold, newThreshold);
    }

    /**
     * @dev Update freshness timeout (governor only)
     * @param newTimeout New timeout in seconds
     */
    function updateFreshnessTimeout(uint256 newTimeout) external onlyGovernor {
        if (newTimeout < MIN_FRESHNESS_TIMEOUT || newTimeout > MAX_FRESHNESS_TIMEOUT) {
            revert InvalidParameter();
        }

        uint256 oldTimeout = _freshnessTimeout;
        _freshnessTimeout = newTimeout;
        emit FreshnessTimeoutUpdated(oldTimeout, newTimeout);
    }

    /**
     * @dev Get number of active attestors
     * @return count Number of active attestors
     */
    function getAttestorCount() external view returns (uint256 count) {
        return _attestorList.length;
    }

    /**
     * @dev Check if address is an attestor
     * @param attestor Address to check
     * @return active Whether address is active attestor
     */
    function isAttestor(address attestor) external view returns (bool active) {
        return _attestors[attestor];
    }

    /**
     * @dev Get signature threshold
     * @return threshold Current signature threshold
     */
    function getThreshold() external view returns (uint256 threshold) {
        return _threshold;
    }

    /**
     * @dev Get freshness timeout
     * @return timeout Current freshness timeout
     */
    function getFreshnessTimeout() external view returns (uint256 timeout) {
        return _freshnessTimeout;
    }

    /**
     * @dev Get domain separator for off-chain signature generation
     * @return separator EIP-712 domain separator
     */
    function getDomainSeparator() external view returns (bytes32 separator) {
        return _domainSeparatorV4();
    }

    /**
     * @dev Get list of all attestors
     * @return attestors Array of attestor addresses
     */
    function getAttestors() external view returns (address[] memory attestors) {
        return _attestorList;
    }

    /**
     * @dev Check if nonce has been used
     * @param nonce Nonce to check
     * @return used Whether nonce has been used
     */
    function isNonceUsed(uint256 nonce) external view returns (bool used) {
        return _usedNonces[nonce];
    }

    /**
     * @dev Internal function to add attestor
     * @param attestor Address of attestor to add
     */
    function _addAttestor(address attestor) private {
        _validateAddress(attestor);
        
        if (_attestors[attestor]) revert InvalidParameter();
        if (_attestorList.length >= MAX_ATTESTORS) revert InvalidParameter();

        _attestors[attestor] = true;
        _attestorList.push(attestor);
        
        emit AttestorAdded(attestor);
    }
}
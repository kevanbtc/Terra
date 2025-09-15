// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICSVOracle
 * @dev Interface for CSV oracle providing NAV and portfolio data
 * @notice Oracle aggregates insurance portfolio data with cryptographic attestation
 */
interface ICSVOracle {
    /**
     * @dev Custom errors
     */
    error StaleData();
    error InsufficientAttestors();
    error InvalidSignature();
    error UnauthorizedAttestor();
    error InvalidNonce();
    error ZeroAddress();

    /**
     * @dev Events for oracle updates
     */
    event OracleDataUpdated(
        uint256 indexed timestamp,
        uint256 navPerToken,
        string dataCID,
        uint256 nonce
    );
    event AttestorAdded(address indexed attestor);
    event AttestorRemoved(address indexed attestor);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event FreshnessTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);

    /**
     * @dev Oracle data structure
     */
    struct OracleData {
        uint256 navPerToken;      // NAV per token in USD (18 decimals)
        uint256 totalSupply;      // Total token supply
        uint256 utilizationBps;   // Vault utilization in basis points
        uint256 ltvBps;          // Current LTV in basis points
        uint256 timestamp;        // When data was generated
        uint256 blockNumber;      // Block number for reference
        string dataCID;          // IPFS CID of detailed portfolio data
        uint256 nonce;           // Anti-replay nonce
    }

    /**
     * @dev Attestor signature structure
     */
    struct AttestorSignature {
        address attestor;
        bytes signature;
    }

    /**
     * @dev Submit oracle data with multi-attestor signatures
     * @param data Oracle data to submit
     * @param signatures Array of attestor signatures
     */
    function updateOracleData(
        OracleData calldata data,
        AttestorSignature[] calldata signatures
    ) external;

    /**
     * @dev Get latest oracle data
     * @return data Latest verified oracle data
     */
    function getLatestData() external view returns (OracleData memory data);

    /**
     * @dev Get NAV per token with freshness check
     * @return navPerToken Current NAV per token
     * @return isStale Whether data is stale
     */
    function getNavPerToken() external view returns (uint256 navPerToken, bool isStale);

    /**
     * @dev Check if oracle data is fresh
     * @return fresh Whether data is within freshness threshold
     */
    function isFresh() external view returns (bool fresh);

    /**
     * @dev Get number of active attestors
     * @return count Number of active attestors
     */
    function getAttestorCount() external view returns (uint256 count);

    /**
     * @dev Check if address is an active attestor
     * @param attestor Address to check
     * @return active Whether address is active attestor
     */
    function isAttestor(address attestor) external view returns (bool active);

    /**
     * @dev Get signature threshold (minimum signatures required)
     * @return threshold Number of signatures required
     */
    function getThreshold() external view returns (uint256 threshold);

    /**
     * @dev Get freshness timeout in seconds
     * @return timeout Freshness timeout
     */
    function getFreshnessTimeout() external view returns (uint256 timeout);

    /**
     * @dev Get domain separator for signature verification
     * @return separator EIP-712 domain separator
     */
    function getDomainSeparator() external view returns (bytes32 separator);
}
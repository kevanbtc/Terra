// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IERCRWACSV.sol";
import "../interfaces/ICSVOracle.sol";
import "./GovControlled.sol";

/**
 * @title CSVVault
 * @dev Vault contract managing deposits, withdrawals, and redemptions for CSV tokens
 * @notice Implements pull-payment pattern for security and carrier concentration limits
 */
contract CSVVault is GovControlled {
    using SafeERC20 for IERC20;
    using Address for address payable;

    /**
     * @dev Vault configuration constants
     */
    uint256 public constant MAX_CARRIER_CONCENTRATION_BPS = 2500; // 25%
    uint256 public constant MIN_VINTAGE_MONTHS = 6;
    uint256 public constant MAX_VINTAGE_MONTHS = 120; // 10 years
    uint256 public constant REDEMPTION_DELAY = 7 days;

    /**
     * @dev State variables
     */
    IERCRWACSV public immutable csvToken;
    ICSVOracle public immutable oracle;
    IERC20 public immutable stablecoin; // USDC or similar
    
    uint256 public totalDeposits;
    uint256 public carrierConcentrationCapBps;
    uint256 public minVintageMonths;
    uint256 public maxVintageMonths;
    
    /**
     * @dev Carrier tracking for concentration limits
     */
    struct CarrierExposure {
        uint256 totalValue;
        uint256 policyCount;
        bool isActive;
    }
    
    mapping(string => CarrierExposure) public carrierExposures;
    string[] public activeCarriers;
    
    /**
     * @dev Redemption queue for pull payments
     */
    struct RedemptionRequest {
        address user;
        uint256 amount;
        uint256 requestTime;
        uint256 valueAtRequest;
        bool processed;
    }
    
    mapping(uint256 => RedemptionRequest) public redemptionRequests;
    mapping(address => uint256[]) public userRedemptionIds;
    uint256 public nextRedemptionId;
    uint256 public totalPendingRedemptions;

    /**
     * @dev Events
     */
    event Deposit(address indexed user, uint256 stablecoinAmount, uint256 csvTokensReceived);
    event RedemptionRequested(address indexed user, uint256 indexed requestId, uint256 csvAmount);
    event RedemptionProcessed(address indexed user, uint256 indexed requestId, uint256 stablecoinAmount);
    event CarrierExposureUpdated(string indexed carrier, uint256 totalValue, uint256 policyCount);
    event ConcentrationCapUpdated(uint256 oldCap, uint256 newCap);
    event VintageRangeUpdated(uint256 oldMin, uint256 newMin, uint256 oldMax, uint256 newMax);

    /**
     * @dev Custom errors
     */
    error ExcessiveCarrierConcentration(string carrier);
    error InvalidVintage(uint256 vintageMonths);
    error InsufficientLiquidity();
    error RedemptionNotReady();
    error RedemptionAlreadyProcessed();
    error NoRedemptionFound();

    /**
     * @dev Constructor
     * @param csvToken_ CSV token contract
     * @param oracle_ Oracle contract
     * @param stablecoin_ Stablecoin for deposits (USDC)
     * @param governor Governor address
     * @param guardian Guardian address
     */
    constructor(
        address csvToken_,
        address oracle_,
        address stablecoin_,
        address governor,
        address guardian
    ) 
        GovControlled(governor, guardian) 
    {
        _validateAddress(csvToken_);
        _validateAddress(oracle_);
        _validateAddress(stablecoin_);
        
        csvToken = IERCRWACSV(csvToken_);
        oracle = ICSVOracle(oracle_);
        stablecoin = IERC20(stablecoin_);
        
        // Set initial parameters
        carrierConcentrationCapBps = 2000; // 20% default
        minVintageMonths = MIN_VINTAGE_MONTHS;
        maxVintageMonths = MAX_VINTAGE_MONTHS;
    }

    /**
     * @dev Deposit stablecoins and receive CSV tokens
     * @param stablecoinAmount Amount of stablecoins to deposit
     * @param minCsvTokens Minimum CSV tokens to receive (slippage protection)
     */
    function deposit(uint256 stablecoinAmount, uint256 minCsvTokens) 
        external 
        nonReentrant 
        whenNotPausedWithReason 
    {
        _validateAmount(stablecoinAmount);
        
        // Check oracle freshness
        (uint256 navPerToken, bool isStale) = oracle.getNavPerToken();
        if (isStale) revert StaleOracle();

        // Calculate CSV tokens to mint
        uint256 csvTokensToMint = (stablecoinAmount * 1e18) / navPerToken;
        if (csvTokensToMint < minCsvTokens) revert InsufficientCollateral();

        // Transfer stablecoins from user
        stablecoin.safeTransferFrom(msg.sender, address(this), stablecoinAmount);
        totalDeposits += stablecoinAmount;

        // Mint CSV tokens to user
        csvToken.mint(msg.sender, csvTokensToMint, stablecoinAmount);
        
        emit Deposit(msg.sender, stablecoinAmount, csvTokensToMint);
    }

    /**
     * @dev Request redemption of CSV tokens (starts redemption delay)
     * @param csvAmount Amount of CSV tokens to redeem
     */
    function requestRedemption(uint256 csvAmount) external nonReentrant whenNotPausedWithReason {
        _validateAmount(csvAmount);
        
        // Check user has sufficient CSV tokens
        if (csvToken.balanceOf(msg.sender) < csvAmount) revert InsufficientCollateral();
        
        // Get current NAV for value calculation
        (uint256 navPerToken, bool isStale) = oracle.getNavPerToken();
        if (isStale) revert StaleOracle();
        
        uint256 valueAtRequest = (csvAmount * navPerToken) / 1e18;
        
        // Transfer CSV tokens to vault
        csvToken.transferFrom(msg.sender, address(this), csvAmount);
        
        // Create redemption request
        uint256 requestId = nextRedemptionId++;
        redemptionRequests[requestId] = RedemptionRequest({
            user: msg.sender,
            amount: csvAmount,
            requestTime: block.timestamp,
            valueAtRequest: valueAtRequest,
            processed: false
        });
        
        userRedemptionIds[msg.sender].push(requestId);
        totalPendingRedemptions += csvAmount;
        
        emit RedemptionRequested(msg.sender, requestId, csvAmount);
    }

    /**
     * @dev Process redemption after delay period (pull payment)
     * @param requestId ID of redemption request to process
     */
    function processRedemption(uint256 requestId) external nonReentrant {
        RedemptionRequest storage request = redemptionRequests[requestId];
        
        if (request.user == address(0)) revert NoRedemptionFound();
        if (request.processed) revert RedemptionAlreadyProcessed();
        if (block.timestamp < request.requestTime + REDEMPTION_DELAY) {
            revert RedemptionNotReady();
        }
        
        // Mark as processed
        request.processed = true;
        totalPendingRedemptions -= request.amount;
        
        // Get current NAV for final calculation
        (uint256 navPerToken, bool isStale) = oracle.getNavPerToken();
        if (isStale) revert StaleOracle();
        
        // Use the lower of request value or current value (protects against oracle manipulation)
        uint256 currentValue = (request.amount * navPerToken) / 1e18;
        uint256 stablecoinAmount = currentValue < request.valueAtRequest 
            ? currentValue 
            : request.valueAtRequest;
        
        // Check vault has sufficient liquidity
        uint256 availableLiquidity = stablecoin.balanceOf(address(this));
        if (availableLiquidity < stablecoinAmount) revert InsufficientLiquidity();
        
        // Burn CSV tokens and transfer stablecoins
        csvToken.burn(address(this), request.amount);
        stablecoin.safeTransfer(request.user, stablecoinAmount);
        
        if (totalDeposits >= stablecoinAmount) {
            totalDeposits -= stablecoinAmount;
        } else {
            totalDeposits = 0;
        }
        
        emit RedemptionProcessed(request.user, requestId, stablecoinAmount);
    }

    /**
     * @dev Update carrier exposure data (oracle role)
     * @param carrier Carrier name
     * @param totalValue Total value of policies for this carrier
     * @param policyCount Number of policies
     */
    function updateCarrierExposure(
        string calldata carrier,
        uint256 totalValue,
        uint256 policyCount
    ) external onlyOracle {
        CarrierExposure storage exposure = carrierExposures[carrier];
        
        // Add to active carriers list if new
        if (!exposure.isActive && totalValue > 0) {
            activeCarriers.push(carrier);
            exposure.isActive = true;
        }
        
        // Remove from active list if value becomes 0
        if (exposure.isActive && totalValue == 0) {
            _removeCarrier(carrier);
            exposure.isActive = false;
        }
        
        exposure.totalValue = totalValue;
        exposure.policyCount = policyCount;
        
        emit CarrierExposureUpdated(carrier, totalValue, policyCount);
    }

    /**
     * @dev Check if adding policies would violate carrier concentration
     * @param carrier Carrier name
     * @param additionalValue Additional value to add
     * @return allowed Whether addition is allowed
     */
    function checkCarrierConcentration(string calldata carrier, uint256 additionalValue) 
        external 
        view 
        returns (bool allowed) 
    {
        uint256 totalPortfolioValue = csvToken.getTotalCollateral();
        if (totalPortfolioValue == 0) return true;
        
        uint256 newCarrierValue = carrierExposures[carrier].totalValue + additionalValue;
        uint256 newConcentrationBps = (newCarrierValue * 10000) / totalPortfolioValue;
        
        return newConcentrationBps <= carrierConcentrationCapBps;
    }

    /**
     * @dev Validate policy vintage
     * @param vintageMonths Age of policy in months
     * @return valid Whether vintage is acceptable
     */
    function validateVintage(uint256 vintageMonths) external view returns (bool valid) {
        return vintageMonths >= minVintageMonths && vintageMonths <= maxVintageMonths;
    }

    /**
     * @dev Update carrier concentration cap (governor only)
     * @param newCapBps New concentration cap in basis points
     */
    function updateCarrierConcentrationCap(uint256 newCapBps) external onlyGovernor {
        _validateBasisPoints(newCapBps);
        if (newCapBps > MAX_CARRIER_CONCENTRATION_BPS) revert InvalidParameter();
        
        uint256 oldCap = carrierConcentrationCapBps;
        carrierConcentrationCapBps = newCapBps;
        
        _updateParameter("carrierConcentrationCapBps", oldCap, newCapBps);
        emit ConcentrationCapUpdated(oldCap, newCapBps);
    }

    /**
     * @dev Update vintage range (governor only)
     * @param newMinMonths New minimum vintage in months
     * @param newMaxMonths New maximum vintage in months
     */
    function updateVintageRange(uint256 newMinMonths, uint256 newMaxMonths) external onlyGovernor {
        if (newMinMonths < MIN_VINTAGE_MONTHS || newMaxMonths > MAX_VINTAGE_MONTHS) {
            revert InvalidParameter();
        }
        if (newMinMonths >= newMaxMonths) revert InvalidParameter();
        
        uint256 oldMin = minVintageMonths;
        uint256 oldMax = maxVintageMonths;
        
        minVintageMonths = newMinMonths;
        maxVintageMonths = newMaxMonths;
        
        emit VintageRangeUpdated(oldMin, newMinMonths, oldMax, newMaxMonths);
    }

    /**
     * @dev Emergency withdrawal of stablecoins (guardian only)
     * @param amount Amount to withdraw
     * @param recipient Recipient address
     */
    function emergencyWithdraw(uint256 amount, address recipient) external onlyGuardian {
        _validateAddress(recipient);
        _validateAmount(amount);
        
        stablecoin.safeTransfer(recipient, amount);
    }

    /**
     * @dev Get vault metrics
     * @return totalDeposits_ Total deposits in vault
     * @return utilizationBps Current utilization in basis points
     * @return availableLiquidity Available liquidity for redemptions
     * @return pendingRedemptions Total pending redemptions
     */
    function getVaultMetrics() 
        external 
        view 
        returns (
            uint256 totalDeposits_,
            uint256 utilizationBps,
            uint256 availableLiquidity,
            uint256 pendingRedemptions
        ) 
    {
        totalDeposits_ = totalDeposits;
        availableLiquidity = stablecoin.balanceOf(address(this));
        pendingRedemptions = totalPendingRedemptions;
        
        if (totalDeposits > 0) {
            utilizationBps = ((totalDeposits - availableLiquidity) * 10000) / totalDeposits;
        }
    }

    /**
     * @dev Get user's redemption requests
     * @param user User address
     * @return requestIds Array of redemption request IDs
     */
    function getUserRedemptions(address user) external view returns (uint256[] memory requestIds) {
        return userRedemptionIds[user];
    }

    /**
     * @dev Get active carriers list
     * @return carriers Array of active carrier names
     */
    function getActiveCarriers() external view returns (string[] memory carriers) {
        return activeCarriers;
    }

    /**
     * @dev Internal function to remove carrier from active list
     * @param carrier Carrier to remove
     */
    function _removeCarrier(string calldata carrier) private {
        for (uint256 i = 0; i < activeCarriers.length; i++) {
            if (keccak256(bytes(activeCarriers[i])) == keccak256(bytes(carrier))) {
                activeCarriers[i] = activeCarriers[activeCarriers.length - 1];
                activeCarriers.pop();
                break;
            }
        }
    }
}
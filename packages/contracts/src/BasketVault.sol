// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IExecutionRouter {
    function buy(address tokenOut, uint256 usdgIn, uint256 minimumTokenOut)
        external
        returns (uint256);
    function sell(address tokenIn, uint256 tokenInAmount, uint256 minimumUsdgOut)
        external
        returns (uint256);
}

interface IValuationAdapter {
    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid);
}

interface IRewardFund {
    function fund(uint256 amount) external;
}

interface IAssetRegistryView {
    function isActive(address token) external view returns (bool);
    function isHighVolatility(address token) external view returns (bool);
    function maximumWeightBps(address token) external view returns (uint16);
}

interface IExecutionAdapterV3 {
    struct ExecutionIntent {
        address vault;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minimumAmountOut;
        address recipient;
        address target;
        address allowanceTarget;
        bytes32 callDataHash;
        uint256 expiry;
        uint256 referenceBlock;
        uint256 nonce;
    }

    function execute(
        ExecutionIntent calldata intent,
        bytes calldata executionData,
        bytes calldata authorizerSignature
    ) external returns (uint256 amountOut);
}

contract BasketVault is
    Initializable,
    UUPSUpgradeable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    error QueuedExitsDisabled();
    error InvalidConfiguration();
    error InvalidAsset();
    error UnsupportedAsset();
    error AssetHasBalance();
    error AssetMissing();
    error ControlsNotConfigured();
    error BuysDisabled();
    error SellsDisabled();
    error RebalancesDisabled();
    error SwapPlanRequired();
    error SwapPlansNotConfigured();
    error Expired();
    error MinimumDeposit();
    error TvlCapExceeded();
    error WalletCapExceeded();
    error TransferFailed();
    error NoValueAdded();
    error SharesBelowMinimum();
    error InvalidShares();
    error NoSupply();
    error MinimumRedemption();
    error ProceedsBelowMinimum();
    error InvalidSwapPlan();
    error InvalidPrice();
    error StalePrice();
    error InvalidWeights();
    error AllocationLimitExceeded();

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant BRAIN_FEE_SHARE_BPS = 5_000;
    uint256 public constant CREATOR_FEE_SHARE_BPS = 4_000;
    uint256 public constant MIN_USDG_BPS = 2_000;
    uint256 public constant MIN_REDEMPTION_VALUE = 10e18;
    uint256 public constant TVL_CAP = 100_000e18;
    uint256 public constant WALLET_VALUE_CAP = 25_000e18;
    uint256 internal constant DUST_BPS = 1;
    uint256 internal constant MAX_RISK_POSITIONS = 9;
    uint256 internal constant MAX_ASSET_WEIGHT_BPS = 2_000;
    uint256 internal constant MAX_HIGH_VOLATILITY_BPS = 3_000;

    struct RedemptionRequest {
        address account;
        uint256 shares;
        uint256 minimumNet;
        uint256 deadline;
        bool pending;
    }

    struct SwapPlan {
        IExecutionAdapterV3.ExecutionIntent intent;
        bytes executionData;
        bytes authorizerSignature;
    }

    // V1 storage. Do not reorder.
    IERC20 public usdg;
    IExecutionRouter public router;
    IRewardFund public rewards;
    address public creatorVault;
    address public automationVault;
    address[] public assets;
    mapping(address => bool) public supportedAsset;
    uint256 public nextRedemptionRequestId;
    uint256 public nextRedemptionToProcess;
    mapping(uint256 => RedemptionRequest) public redemptionRequests;
    mapping(address => uint256) public pendingRedemptionByAccount;

    // V2 storage. Appended for UUPS compatibility.
    IValuationAdapter public valuation;
    uint256 public maximumPriceAge;
    uint256 public maximumSlippageBps;
    mapping(address => uint16) public latestTargetWeightBps;

    // V3 storage. Consumes three slots from the original V2 storage gap.
    IAssetRegistryView public assetRegistry;
    IExecutionAdapterV3 public executionAdapter;
    bool public swapPlansRequired;
    // V4 storage. Granular launch controls allow a verified paused mainnet canary.
    bool public canaryControlsConfigured;
    bool public buysEnabled;
    bool public sellsEnabled;
    bool public rebalancesEnabled;
    uint256[41] private __gap;

    event Deposited(address indexed account, uint256 gross, uint256 shares, uint256 fee);
    event DepositAssetPurchased(
        address indexed account, address indexed asset, uint256 usdgSpent, uint256 assetReceived
    );
    event Redeemed(address indexed account, uint256 shares, uint256 net, uint256 fee);
    event RedemptionAssetSold(
        address indexed account, address indexed asset, uint256 assetSold, uint256 usdgReceived
    );
    event RedemptionQueued(
        uint256 indexed requestId, address indexed account, uint256 shares, uint256 minimumNet
    );
    event RedemptionCancelled(uint256 indexed requestId, address indexed account, uint256 shares);
    event QueuedRedemptionSettled(
        uint256 indexed requestId, address indexed account, uint256 shares, uint256 net, uint256 fee
    );
    event Rebalanced(bytes32 indexed cycleHash, uint256 navAfter);
    event RebalanceAssetTraded(
        bytes32 indexed cycleHash,
        address indexed asset,
        bool isBuy,
        uint256 assetAmount,
        uint256 usdgAmount,
        uint256 valuationUsd
    );
    event TargetWeightsUpdated(bytes32 indexed cycleHash, address[] assets, uint16[] weights);
    event BasketV2Configured(
        address indexed valuation, uint256 maximumPriceAge, uint256 maximumSlippageBps
    );
    event BasketV3Configured(address indexed assetRegistry, address indexed executionAdapter);
    event CanaryControlsConfigured(bool buysEnabled, bool sellsEnabled, bool rebalancesEnabled);
    event SupportedAssetAdded(address indexed asset);
    event SupportedAssetRemoved(address indexed asset);

    function initialize(
        address admin,
        address usdg_,
        address router_,
        address rewards_,
        address creatorVault_,
        address automationVault_,
        address[] calldata assets_
    ) external initializer {
        __ERC20_init("MillionDollar Basket Share", "MDBS");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
        usdg = IERC20(usdg_);
        router = IExecutionRouter(router_);
        rewards = IRewardFund(rewards_);
        creatorVault = creatorVault_;
        automationVault = automationVault_;
        nextRedemptionRequestId = 1;
        nextRedemptionToProcess = 1;
        valuation = IValuationAdapter(router_);
        maximumPriceAge = 120;
        maximumSlippageBps = 100;
        for (uint256 i; i < assets_.length; ++i) {
            supportedAsset[assets_[i]] = true;
            assets.push(assets_[i]);
        }
    }

    function reinitializeV2(
        address valuation_,
        uint256 maximumPriceAge_,
        uint256 maximumSlippageBps_,
        address[] calldata targetAssets,
        uint16[] calldata targetWeights
    ) external reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
        if (valuation_ == address(0) || maximumPriceAge_ == 0 || maximumSlippageBps_ > 500) {
            revert InvalidConfiguration();
        }
        valuation = IValuationAdapter(valuation_);
        maximumPriceAge = maximumPriceAge_;
        maximumSlippageBps = maximumSlippageBps_;
        _storeTargetWeights(targetAssets, targetWeights, bytes32(0));
        emit BasketV2Configured(valuation_, maximumPriceAge_, maximumSlippageBps_);
    }

    function reinitializeV3(address assetRegistry_, address executionAdapter_)
        external
        reinitializer(3)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (assetRegistry_ == address(0) || executionAdapter_ == address(0)) {
            revert InvalidConfiguration();
        }
        assetRegistry = IAssetRegistryView(assetRegistry_);
        executionAdapter = IExecutionAdapterV3(executionAdapter_);
        swapPlansRequired = true;
        emit BasketV3Configured(assetRegistry_, executionAdapter_);
    }

    function reinitializeV4(bool buysEnabled_, bool sellsEnabled_, bool rebalancesEnabled_)
        external
        reinitializer(4)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setCanaryControls(buysEnabled_, sellsEnabled_, rebalancesEnabled_);
    }

    function setCanaryControls(bool buysEnabled_, bool sellsEnabled_, bool rebalancesEnabled_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (!canaryControlsConfigured) revert ControlsNotConfigured();
        _setCanaryControls(buysEnabled_, sellsEnabled_, rebalancesEnabled_);
    }

    function addSupportedAsset(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (asset == address(0) || asset == address(usdg) || supportedAsset[asset]) {
            revert InvalidAsset();
        }
        if (address(assetRegistry) == address(0) || !assetRegistry.isActive(asset)) {
            revert InvalidAsset();
        }
        supportedAsset[asset] = true;
        assets.push(asset);
        emit SupportedAssetAdded(asset);
    }

    function removeSupportedAsset(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!supportedAsset[asset]) revert UnsupportedAsset();
        if (IERC20(asset).balanceOf(address(this)) != 0) revert AssetHasBalance();
        supportedAsset[asset] = false;
        latestTargetWeightBps[asset] = 0;
        for (uint256 i; i < assets.length; ++i) {
            if (assets[i] == asset) {
                assets[i] = assets[assets.length - 1];
                assets.pop();
                emit SupportedAssetRemoved(asset);
                return;
            }
        }
        revert AssetMissing();
    }

    function supportedAssets() external view returns (address[] memory) {
        return assets;
    }

    function totalAssetsUsd() public view returns (uint256 total) {
        total = _reserveToUsdWad(usdg.balanceOf(address(this)));
        for (uint256 i; i < assets.length; ++i) {
            total += _quoteUsd(assets[i], IERC20(assets[i]).balanceOf(address(this)));
        }
    }

    function nav() public view returns (uint256) {
        return totalAssetsUsd();
    }

    function navPerShareWad() public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? 1e18 : (totalAssetsUsd() * 1e18) / supply;
    }

    function assetValueUsd(address asset) public view returns (uint256) {
        if (asset == address(usdg)) {
            return _reserveToUsdWad(usdg.balanceOf(address(this)));
        }
        if (!supportedAsset[asset]) revert UnsupportedAsset();
        return _quoteUsd(asset, IERC20(asset).balanceOf(address(this)));
    }

    function currentWeightBps(address asset) external view returns (uint256) {
        uint256 currentNav = totalAssetsUsd();
        return
            currentNav == 0
                ? latestTargetWeightBps[asset]
                : (assetValueUsd(asset) * BPS) / currentNav;
    }

    function oracleStatus(address asset)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid)
    {
        if (asset == address(usdg)) return (1e18, block.timestamp, true);
        return valuation.quoteStatus(asset);
    }

    function previewDeposit(uint256 grossAmount)
        external
        view
        returns (uint256 fee, uint256 netContribution, uint256 expectedShares)
    {
        fee = (grossAmount * FEE_BPS) / BPS;
        netContribution = grossAmount - fee;
        uint256 supply = totalSupply();
        uint256 currentNav = totalAssetsUsd();
        uint256 contributionWad = _reserveToUsdWad(netContribution);
        expectedShares = supply == 0 ? contributionWad : (contributionWad * supply) / currentNav;
    }

    function previewRedeem(uint256 shares)
        public
        view
        returns (uint256 gross, uint256 fee, uint256 net, bool immediate)
    {
        uint256 supply = totalSupply();
        if (shares == 0 || supply == 0 || shares > supply) return (0, 0, 0, false);
        gross = _usdWadToReserve((shares * totalAssetsUsd()) / supply);
        fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
        immediate = _reserveToUsdWad(gross) >= MIN_REDEMPTION_VALUE;
    }

    function deposit(uint256 grossAmount, uint256 minimumShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (!_buysEnabled()) revert BuysDisabled();
        if (swapPlansRequired) revert SwapPlanRequired();
        return _depositLegacy(grossAmount, minimumShares, deadline);
    }

    function depositWithPlan(
        uint256 grossAmount,
        uint256 minimumShares,
        uint256 deadline,
        SwapPlan[] calldata plans
    ) external nonReentrant returns (uint256 shares) {
        if (!_buysEnabled()) revert BuysDisabled();
        if (!swapPlansRequired) revert SwapPlansNotConfigured();
        if (block.timestamp > deadline) revert Expired();
        if (grossAmount < _usdWadToReserve(10e18)) revert MinimumDeposit();
        uint256 beforeNav = totalAssetsUsd();
        uint256 beforeSupply = totalSupply();
        uint256 fee = (grossAmount * FEE_BPS) / BPS;
        uint256 net = grossAmount - fee;
        uint256 netWad = _reserveToUsdWad(net);
        if (beforeNav + _reserveToUsdWad(grossAmount) > TVL_CAP) revert TvlCapExceeded();
        uint256 walletValue =
            beforeSupply == 0 ? 0 : (balanceOf(msg.sender) * beforeNav) / beforeSupply;
        if (walletValue + netWad > WALLET_VALUE_CAP) revert WalletCapExceeded();
        if (!usdg.transferFrom(msg.sender, address(this), grossAmount)) revert TransferFailed();
        _routeFee(fee);
        _investDepositWithPlans(msg.sender, net, beforeNav, plans);
        uint256 afterNav = totalAssetsUsd();
        if (afterNav <= beforeNav) revert NoValueAdded();
        uint256 actualValueAdded = afterNav - beforeNav;
        shares =
            beforeSupply == 0 ? actualValueAdded : (actualValueAdded * beforeSupply) / beforeNav;
        if (shares < minimumShares) revert SharesBelowMinimum();
        _mint(msg.sender, shares);
        emit Deposited(msg.sender, grossAmount, shares, fee);
    }

    function _depositLegacy(uint256 grossAmount, uint256 minimumShares, uint256 deadline)
        private
        returns (uint256 shares)
    {
        if (block.timestamp > deadline) revert Expired();
        if (grossAmount < _usdWadToReserve(10e18)) revert MinimumDeposit();
        uint256 beforeNav = totalAssetsUsd();
        uint256 beforeSupply = totalSupply();
        uint256 fee = (grossAmount * FEE_BPS) / BPS;
        uint256 net = grossAmount - fee;
        uint256 netWad = _reserveToUsdWad(net);
        if (beforeNav + _reserveToUsdWad(grossAmount) > TVL_CAP) revert TvlCapExceeded();
        uint256 walletValue =
            beforeSupply == 0 ? 0 : (balanceOf(msg.sender) * beforeNav) / beforeSupply;
        if (walletValue + netWad > WALLET_VALUE_CAP) revert WalletCapExceeded();

        if (!usdg.transferFrom(msg.sender, address(this), grossAmount)) revert TransferFailed();
        _routeFee(fee);
        _investDeposit(msg.sender, net, beforeNav);

        uint256 afterNav = totalAssetsUsd();
        if (afterNav <= beforeNav) revert NoValueAdded();
        uint256 actualValueAdded = afterNav - beforeNav;
        shares =
            beforeSupply == 0 ? actualValueAdded : (actualValueAdded * beforeSupply) / beforeNav;
        if (shares < minimumShares) revert SharesBelowMinimum();
        _mint(msg.sender, shares);
        emit Deposited(msg.sender, grossAmount, shares, fee);
    }

    function redeem(uint256 shares, uint256 minimumNet, uint256 deadline)
        external
        nonReentrant
        returns (uint256 net)
    {
        if (!_sellsEnabled()) revert SellsDisabled();
        if (swapPlansRequired) revert SwapPlanRequired();
        return _redeemLegacy(shares, minimumNet, deadline);
    }

    function redeemWithPlan(
        uint256 shares,
        uint256 minimumNet,
        uint256 deadline,
        SwapPlan[] calldata plans
    ) external nonReentrant returns (uint256 net) {
        if (!_sellsEnabled()) revert SellsDisabled();
        if (!swapPlansRequired) revert SwapPlansNotConfigured();
        if (block.timestamp > deadline) revert Expired();
        uint256 supply = totalSupply();
        if (shares == 0 || shares > balanceOf(msg.sender)) revert InvalidShares();
        if (supply == 0) revert NoSupply();
        uint256 expectedGross = (shares * totalAssetsUsd()) / supply;
        if (expectedGross < MIN_REDEMPTION_VALUE) revert MinimumRedemption();
        uint256 gross = _liquidateProRataWithPlans(msg.sender, shares, supply, plans);
        uint256 fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
        if (net < minimumNet) revert ProceedsBelowMinimum();
        _burn(msg.sender, shares);
        _routeFee(fee);
        if (!usdg.transfer(msg.sender, net)) revert TransferFailed();
        emit Redeemed(msg.sender, shares, net, fee);
    }

    function _redeemLegacy(uint256 shares, uint256 minimumNet, uint256 deadline)
        private
        returns (uint256 net)
    {
        if (block.timestamp > deadline) revert Expired();
        uint256 supply = totalSupply();
        if (shares == 0 || shares > balanceOf(msg.sender)) revert InvalidShares();
        if (supply == 0) revert NoSupply();
        uint256 currentNav = totalAssetsUsd();
        uint256 expectedGross = (shares * currentNav) / supply;
        if (expectedGross < MIN_REDEMPTION_VALUE) revert MinimumRedemption();
        uint256 gross = _liquidateProRata(msg.sender, shares, supply);
        uint256 fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
        if (net < minimumNet) revert ProceedsBelowMinimum();
        _burn(msg.sender, shares);
        _routeFee(fee);
        if (!usdg.transfer(msg.sender, net)) revert TransferFailed();
        emit Redeemed(msg.sender, shares, net, fee);
    }

    function canRedeemImmediately(address account, uint256 shares) public view returns (bool) {
        if (shares == 0 || totalSupply() == 0 || shares > balanceOf(account)) return false;
        (uint256 gross,,, bool immediate) = previewRedeem(shares);
        return _reserveToUsdWad(gross) >= MIN_REDEMPTION_VALUE && immediate;
    }

    function requestRedemption(uint256, uint256, uint256) external pure returns (uint256) {
        revert QueuedExitsDisabled();
    }

    function cancelRedemption(uint256) external pure {
        revert QueuedExitsDisabled();
    }

    function processRedemptions(uint256) external pure returns (uint256) {
        revert QueuedExitsDisabled();
    }

    function rebalance(
        address[] calldata targetAssets,
        uint16[] calldata weights,
        bytes32 cycleHash
    ) external onlyRole(KEEPER_ROLE) nonReentrant {
        if (!_rebalancesEnabled()) revert RebalancesDisabled();
        if (swapPlansRequired) revert SwapPlanRequired();
        _rebalanceLegacy(targetAssets, weights, cycleHash);
    }

    function rebalanceWithPlan(
        address[] calldata targetAssets,
        uint16[] calldata weights,
        bytes32 cycleHash,
        SwapPlan[] calldata plans
    ) external onlyRole(KEEPER_ROLE) nonReentrant {
        if (!_rebalancesEnabled()) revert RebalancesDisabled();
        if (!swapPlansRequired) revert SwapPlansNotConfigured();
        _validateTargetWeights(targetAssets, weights);
        uint256 totalNav = totalAssetsUsd();
        uint256 dustValue = (totalNav * DUST_BPS) / BPS;
        uint256 planIndex;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 currentValue = assetValueUsd(asset);
            uint256 targetValue = (totalNav * _targetWeight(asset, targetAssets, weights)) / BPS;
            if (currentValue <= targetValue || currentValue - targetValue <= dustValue) continue;
            uint256 sellAmount =
                ((currentValue - targetValue) * _unitAmount(asset)) / _unitPrice(asset);
            if (sellAmount == 0) continue;
            if (planIndex >= plans.length) revert InvalidSwapPlan();
            uint256 expectedValue = _quoteUsd(asset, sellAmount);
            uint256 received = _executePlan(
                plans[planIndex++],
                asset,
                address(usdg),
                sellAmount,
                _usdWadToReserve((expectedValue * (BPS - maximumSlippageBps)) / BPS)
            );
            emit RebalanceAssetTraded(cycleHash, asset, false, sellAmount, received, expectedValue);
        }
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 currentValue = assetValueUsd(asset);
            uint256 targetValue = (totalNav * _targetWeight(asset, targetAssets, weights)) / BPS;
            if (targetValue <= currentValue || targetValue - currentValue <= dustValue) continue;
            uint256 buyValue = targetValue - currentValue;
            uint256 reserveIn = _usdWadToReserve(buyValue);
            if (reserveIn == 0) continue;
            if (planIndex >= plans.length) revert InvalidSwapPlan();
            uint256 minimumOut = (buyValue * _unitAmount(asset) * (BPS - maximumSlippageBps))
                / (_unitPrice(asset) * BPS);
            uint256 received =
                _executePlan(plans[planIndex++], address(usdg), asset, reserveIn, minimumOut);
            emit RebalanceAssetTraded(cycleHash, asset, true, received, reserveIn, buyValue);
        }
        if (planIndex != plans.length) revert InvalidSwapPlan();
        _storeTargetWeights(targetAssets, weights, cycleHash);
        emit Rebalanced(cycleHash, totalAssetsUsd());
    }

    function _rebalanceLegacy(
        address[] calldata targetAssets,
        uint16[] calldata weights,
        bytes32 cycleHash
    ) private {
        _validateTargetWeights(targetAssets, weights);
        uint256 totalNav = totalAssetsUsd();
        uint256 dustValue = (totalNav * DUST_BPS) / BPS;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 targetWeight = _targetWeight(asset, targetAssets, weights);
            uint256 currentValue = assetValueUsd(asset);
            uint256 targetValue = (totalNav * targetWeight) / BPS;
            if (currentValue > targetValue) {
                uint256 valueToSell = currentValue - targetValue;
                if (valueToSell <= dustValue) continue;
                uint256 unitPrice = _unitPrice(asset);
                uint256 sellAmount = (valueToSell * _unitAmount(asset)) / unitPrice;
                if (sellAmount > 0) {
                    uint256 expectedProceeds = (sellAmount * unitPrice) / _unitAmount(asset);
                    IERC20(asset).approve(address(router), sellAmount);
                    uint256 usdgReceived = router.sell(
                        asset,
                        sellAmount,
                        _usdWadToReserve((expectedProceeds * (BPS - maximumSlippageBps)) / BPS)
                    );
                    emit RebalanceAssetTraded(
                        cycleHash, asset, false, sellAmount, usdgReceived, expectedProceeds
                    );
                }
            }
        }
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 targetWeight = _targetWeight(asset, targetAssets, weights);
            uint256 currentValue = assetValueUsd(asset);
            uint256 targetValue = (totalNav * targetWeight) / BPS;
            if (targetValue > currentValue) {
                uint256 buyValue = targetValue - currentValue;
                if (buyValue > dustValue) {
                    uint256 minimumOut = (buyValue
                            * _unitAmount(asset)
                            * (BPS - maximumSlippageBps)) / (_unitPrice(asset) * BPS);
                    uint256 reserveIn = _usdWadToReserve(buyValue);
                    if (reserveIn == 0) continue;
                    usdg.approve(address(router), reserveIn);
                    uint256 assetReceived = router.buy(asset, reserveIn, minimumOut);
                    emit RebalanceAssetTraded(
                        cycleHash, asset, true, assetReceived, reserveIn, buyValue
                    );
                }
            }
        }
        _storeTargetWeights(targetAssets, weights, cycleHash);
        emit Rebalanced(cycleHash, totalAssetsUsd());
    }

    function _investDeposit(address account, uint256 net, uint256 beforeNav) private {
        uint256 dustValue = (net * DUST_BPS) / BPS;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 weight = beforeNav == 0
                ? latestTargetWeightBps[asset]
                : (assetValueUsd(asset) * BPS) / beforeNav;
            uint256 buyValue = (net * weight) / BPS;
            if (buyValue == 0 || buyValue <= dustValue) continue;
            uint256 minimumOut =
                (_reserveToUsdWad(buyValue) * _unitAmount(asset) * (BPS - maximumSlippageBps))
                    / (_unitPrice(asset) * BPS);
            usdg.approve(address(router), buyValue);
            uint256 received = router.buy(asset, buyValue, minimumOut);
            emit DepositAssetPurchased(account, asset, buyValue, received);
        }
    }

    function _liquidateProRata(address account, uint256 shares, uint256 supply)
        private
        returns (uint256 gross)
    {
        gross = (usdg.balanceOf(address(this)) * shares) / supply;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 tokenAmount = (IERC20(asset).balanceOf(address(this)) * shares) / supply;
            if (tokenAmount == 0) continue;
            uint256 expectedValue = _quoteUsd(asset, tokenAmount);
            IERC20(asset).approve(address(router), tokenAmount);
            uint256 received = router.sell(
                asset,
                tokenAmount,
                _usdWadToReserve((expectedValue * (BPS - maximumSlippageBps)) / BPS)
            );
            gross += received;
            emit RedemptionAssetSold(account, asset, tokenAmount, received);
        }
    }

    function _investDepositWithPlans(
        address account,
        uint256 net,
        uint256 beforeNav,
        SwapPlan[] calldata plans
    ) private {
        uint256 dustValue = (net * DUST_BPS) / BPS;
        uint256 planIndex;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 weight = beforeNav == 0
                ? latestTargetWeightBps[asset]
                : (assetValueUsd(asset) * BPS) / beforeNav;
            uint256 buyValue = (net * weight) / BPS;
            if (buyValue == 0 || buyValue <= dustValue) continue;
            if (planIndex >= plans.length) revert InvalidSwapPlan();
            uint256 minimumOut =
                (_reserveToUsdWad(buyValue) * _unitAmount(asset) * (BPS - maximumSlippageBps))
                    / (_unitPrice(asset) * BPS);
            uint256 received =
                _executePlan(plans[planIndex++], address(usdg), asset, buyValue, minimumOut);
            emit DepositAssetPurchased(account, asset, buyValue, received);
        }
        if (planIndex != plans.length) revert InvalidSwapPlan();
    }

    function _liquidateProRataWithPlans(
        address account,
        uint256 shares,
        uint256 supply,
        SwapPlan[] calldata plans
    ) private returns (uint256 gross) {
        gross = (usdg.balanceOf(address(this)) * shares) / supply;
        uint256 planIndex;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 tokenAmount = (IERC20(asset).balanceOf(address(this)) * shares) / supply;
            if (tokenAmount == 0) continue;
            if (planIndex >= plans.length) revert InvalidSwapPlan();
            uint256 expectedValue = _quoteUsd(asset, tokenAmount);
            uint256 received = _executePlan(
                plans[planIndex++],
                asset,
                address(usdg),
                tokenAmount,
                _usdWadToReserve((expectedValue * (BPS - maximumSlippageBps)) / BPS)
            );
            gross += received;
            emit RedemptionAssetSold(account, asset, tokenAmount, received);
        }
        if (planIndex != plans.length) revert InvalidSwapPlan();
    }

    function _executePlan(
        SwapPlan calldata plan,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 protocolMinimumOut
    ) private returns (uint256 amountOut) {
        if (
            plan.intent.vault != address(this) || plan.intent.recipient != address(this)
                || plan.intent.tokenIn != tokenIn || plan.intent.tokenOut != tokenOut
                || plan.intent.amountIn != amountIn
                || plan.intent.minimumAmountOut < protocolMinimumOut
        ) {
            revert InvalidSwapPlan();
        }
        IERC20(tokenIn).approve(address(executionAdapter), amountIn);
        amountOut =
            executionAdapter.execute(plan.intent, plan.executionData, plan.authorizerSignature);
        IERC20(tokenIn).approve(address(executionAdapter), 0);
    }

    function _quoteUsd(address asset, uint256 tokenAmount) private view returns (uint256) {
        return (tokenAmount * _unitPrice(asset)) / _unitAmount(asset);
    }

    function _unitAmount(address asset) private view returns (uint256) {
        uint8 decimals = IERC20Metadata(asset).decimals();
        if (decimals > 36) revert InvalidConfiguration();
        return 10 ** decimals;
    }

    function _reserveToUsdWad(uint256 reserveAmount) private view returns (uint256) {
        return (reserveAmount * 1e18) / _unitAmount(address(usdg));
    }

    function _usdWadToReserve(uint256 usdWad) private view returns (uint256) {
        return (usdWad * _unitAmount(address(usdg))) / 1e18;
    }

    function _unitPrice(address asset) private view returns (uint256 priceWad) {
        uint256 updatedAt;
        bool valid;
        (priceWad, updatedAt, valid) = valuation.quoteStatus(asset);
        if (!valid || priceWad == 0) revert InvalidPrice();
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maximumPriceAge) {
            revert StalePrice();
        }
    }

    function _validateTargetWeights(address[] calldata targetAssets, uint16[] calldata weights)
        private
        view
    {
        if (targetAssets.length != weights.length || targetAssets.length == 0) {
            revert InvalidWeights();
        }
        uint256 totalWeight;
        uint256 usdgWeight;
        uint256 riskPositions;
        uint256 highVolatilityWeight;
        for (uint256 i; i < targetAssets.length; ++i) {
            if (targetAssets[i] != address(usdg) && !supportedAsset[targetAssets[i]]) {
                revert UnsupportedAsset();
            }
            for (uint256 j; j < i; ++j) {
                if (targetAssets[j] == targetAssets[i]) revert InvalidWeights();
            }
            totalWeight += weights[i];
            if (targetAssets[i] == address(usdg)) {
                usdgWeight = weights[i];
            } else if (weights[i] > 0) {
                riskPositions++;
                if (address(assetRegistry) != address(0)) {
                    if (weights[i] > MAX_ASSET_WEIGHT_BPS) revert AllocationLimitExceeded();
                    if (!assetRegistry.isActive(targetAssets[i])) revert InvalidAsset();
                    uint16 registryMaximum = assetRegistry.maximumWeightBps(targetAssets[i]);
                    if (registryMaximum == 0 || weights[i] > registryMaximum) {
                        revert AllocationLimitExceeded();
                    }
                    if (assetRegistry.isHighVolatility(targetAssets[i])) {
                        highVolatilityWeight += weights[i];
                    }
                }
            }
        }
        if (totalWeight != BPS || usdgWeight < MIN_USDG_BPS) revert InvalidWeights();
        if (address(assetRegistry) != address(0)) {
            if (
                riskPositions > MAX_RISK_POSITIONS || highVolatilityWeight > MAX_HIGH_VOLATILITY_BPS
            ) {
                revert AllocationLimitExceeded();
            }
        }
    }

    function _storeTargetWeights(
        address[] calldata targetAssets,
        uint16[] calldata weights,
        bytes32 cycleHash
    ) private {
        _validateTargetWeights(targetAssets, weights);
        latestTargetWeightBps[address(usdg)] = 0;
        for (uint256 i; i < assets.length; ++i) {
            latestTargetWeightBps[assets[i]] = 0;
        }
        for (uint256 i; i < targetAssets.length; ++i) {
            latestTargetWeightBps[targetAssets[i]] = weights[i];
        }
        emit TargetWeightsUpdated(cycleHash, targetAssets, weights);
    }

    function _targetWeight(
        address asset,
        address[] calldata targetAssets,
        uint16[] calldata weights
    ) private pure returns (uint256) {
        for (uint256 i; i < targetAssets.length; ++i) {
            if (targetAssets[i] == asset) return weights[i];
        }
        return 0;
    }

    function _routeFee(uint256 fee) private {
        uint256 rewardShare = (fee * BRAIN_FEE_SHARE_BPS) / BPS;
        uint256 creatorShare = (fee * CREATOR_FEE_SHARE_BPS) / BPS;
        uint256 automationShare = fee - rewardShare - creatorShare;
        if (!usdg.transfer(creatorVault, creatorShare)) revert TransferFailed();
        if (!usdg.transfer(automationVault, automationShare)) revert TransferFailed();
        usdg.approve(address(rewards), rewardShare);
        rewards.fund(rewardShare);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }

    function _setCanaryControls(bool buysEnabled_, bool sellsEnabled_, bool rebalancesEnabled_)
        private
    {
        canaryControlsConfigured = true;
        buysEnabled = buysEnabled_;
        sellsEnabled = sellsEnabled_;
        rebalancesEnabled = rebalancesEnabled_;
        emit CanaryControlsConfigured(buysEnabled_, sellsEnabled_, rebalancesEnabled_);
    }

    function _buysEnabled() private view returns (bool) {
        return !canaryControlsConfigured || buysEnabled;
    }

    function _sellsEnabled() private view returns (bool) {
        return !canaryControlsConfigured || sellsEnabled;
    }

    function _rebalancesEnabled() private view returns (bool) {
        return !canaryControlsConfigured || rebalancesEnabled;
    }
}

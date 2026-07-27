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

contract BasketVault is
    Initializable,
    UUPSUpgradeable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant BRAIN_FEE_SHARE_BPS = 5_000;
    uint256 public constant CREATOR_FEE_SHARE_BPS = 4_000;
    uint256 public constant MIN_USDG_BPS = 2_000;
    uint256 public constant MAX_QUEUE_SETTLEMENT_BPS = 500;
    uint256 public constant MAX_IMMEDIATE_REDEMPTION_BPS = 100;
    uint256 public constant MIN_REDEMPTION_VALUE = 10e18;
    uint256 public constant TVL_CAP = 100_000e18;
    uint256 public constant WALLET_VALUE_CAP = 25_000e18;
    uint256 public constant DUST_BPS = 1;

    struct RedemptionRequest {
        address account;
        uint256 shares;
        uint256 minimumNet;
        uint256 deadline;
        bool pending;
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
    uint256[44] private __gap;

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
    event TargetWeightsUpdated(bytes32 indexed cycleHash, address[] assets, uint16[] weights);
    event BasketV2Configured(
        address indexed valuation, uint256 maximumPriceAge, uint256 maximumSlippageBps
    );

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
        require(valuation_ != address(0), "zero valuation");
        require(maximumPriceAge_ > 0, "zero price age");
        require(maximumSlippageBps_ <= 500, "slippage too high");
        valuation = IValuationAdapter(valuation_);
        maximumPriceAge = maximumPriceAge_;
        maximumSlippageBps = maximumSlippageBps_;
        _storeTargetWeights(targetAssets, targetWeights, bytes32(0));
        emit BasketV2Configured(valuation_, maximumPriceAge_, maximumSlippageBps_);
    }

    function totalAssetsUsd() public view returns (uint256 total) {
        total = usdg.balanceOf(address(this));
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
        if (asset == address(usdg)) return usdg.balanceOf(address(this));
        require(supportedAsset[asset], "unsupported asset");
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
        expectedShares = supply == 0 ? netContribution : (netContribution * supply) / currentNav;
    }

    function previewRedeem(uint256 shares)
        public
        view
        returns (uint256 gross, uint256 fee, uint256 net, bool immediate)
    {
        uint256 supply = totalSupply();
        if (shares == 0 || supply == 0 || shares > supply) return (0, 0, 0, false);
        gross = (shares * totalAssetsUsd()) / supply;
        fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
        immediate = gross >= MIN_REDEMPTION_VALUE
            && gross <= (totalAssetsUsd() * MAX_IMMEDIATE_REDEMPTION_BPS) / BPS;
    }

    function deposit(uint256 grossAmount, uint256 minimumShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256 shares)
    {
        require(block.timestamp <= deadline, "expired");
        require(grossAmount >= 10e18, "minimum deposit");
        uint256 beforeNav = totalAssetsUsd();
        uint256 beforeSupply = totalSupply();
        uint256 fee = (grossAmount * FEE_BPS) / BPS;
        uint256 net = grossAmount - fee;
        require(beforeNav + grossAmount <= TVL_CAP, "TVL cap");
        uint256 walletValue =
            beforeSupply == 0 ? 0 : (balanceOf(msg.sender) * beforeNav) / beforeSupply;
        require(walletValue + net <= WALLET_VALUE_CAP, "wallet cap");

        require(
            usdg.transferFrom(msg.sender, address(this), grossAmount), "deposit transfer failed"
        );
        _routeFee(fee);
        _investDeposit(msg.sender, net, beforeNav);

        uint256 afterNav = totalAssetsUsd();
        require(afterNav > beforeNav, "no value added");
        uint256 actualValueAdded = afterNav - beforeNav;
        shares =
            beforeSupply == 0 ? actualValueAdded : (actualValueAdded * beforeSupply) / beforeNav;
        require(shares >= minimumShares, "shares below minimum");
        _mint(msg.sender, shares);
        emit Deposited(msg.sender, grossAmount, shares, fee);
    }

    function redeem(uint256 shares, uint256 minimumNet, uint256 deadline)
        external
        nonReentrant
        returns (uint256 net)
    {
        require(block.timestamp <= deadline, "expired");
        uint256 supply = totalSupply();
        uint256 currentNav = totalAssetsUsd();
        uint256 expectedGross = (shares * currentNav) / supply;
        require(expectedGross >= MIN_REDEMPTION_VALUE, "minimum redemption");
        require(
            expectedGross <= (currentNav * MAX_IMMEDIATE_REDEMPTION_BPS) / BPS, "queue required"
        );
        uint256 gross = _liquidateProRata(msg.sender, shares, supply);
        uint256 fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
        require(net >= minimumNet, "proceeds below minimum");
        _burn(msg.sender, shares);
        _routeFee(fee);
        require(usdg.transfer(msg.sender, net), "redeem transfer failed");
        emit Redeemed(msg.sender, shares, net, fee);
    }

    function canRedeemImmediately(address account, uint256 shares) public view returns (bool) {
        if (shares == 0 || totalSupply() == 0 || shares > balanceOf(account)) return false;
        (uint256 gross,,, bool immediate) = previewRedeem(shares);
        return gross >= MIN_REDEMPTION_VALUE && immediate;
    }

    function requestRedemption(uint256 shares, uint256 minimumNet, uint256 deadline)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        require(shares > 0, "zero shares");
        require(block.timestamp <= deadline, "expired");
        require(
            totalSupply() > 0
                && (shares * totalAssetsUsd()) / totalSupply() >= MIN_REDEMPTION_VALUE,
            "minimum redemption"
        );
        require(pendingRedemptionByAccount[msg.sender] == 0, "request already pending");
        requestId = nextRedemptionRequestId++;
        pendingRedemptionByAccount[msg.sender] = requestId;
        redemptionRequests[requestId] =
            RedemptionRequest(msg.sender, shares, minimumNet, deadline, true);
        _transfer(msg.sender, address(this), shares);
        emit RedemptionQueued(requestId, msg.sender, shares, minimumNet);
    }

    function cancelRedemption(uint256 requestId) external nonReentrant {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.pending && request.account == msg.sender, "not pending owner");
        uint256 shares = request.shares;
        request.pending = false;
        pendingRedemptionByAccount[msg.sender] = 0;
        _transfer(address(this), msg.sender, shares);
        emit RedemptionCancelled(requestId, msg.sender, shares);
    }

    function processRedemptions(uint256 maximumRequests)
        external
        onlyRole(KEEPER_ROLE)
        nonReentrant
        returns (uint256 settled)
    {
        require(maximumRequests > 0, "zero maximum");
        uint256 startingNav = totalAssetsUsd();
        uint256 settlementLimit = (startingNav * MAX_QUEUE_SETTLEMENT_BPS) / BPS;
        uint256 settledGross;
        uint256 requestId = nextRedemptionToProcess;
        while (requestId < nextRedemptionRequestId && settled < maximumRequests) {
            RedemptionRequest storage request = redemptionRequests[requestId];
            if (!request.pending) {
                ++requestId;
                continue;
            }
            if (block.timestamp > request.deadline) break;
            uint256 currentNav = totalAssetsUsd();
            uint256 supply = totalSupply();
            uint256 fullGross = (request.shares * currentNav) / supply;
            uint256 fullNet = fullGross - ((fullGross * FEE_BPS) / BPS);
            if (fullNet < request.minimumNet || settledGross >= settlementLimit) break;

            uint256 remainingCapacity = settlementLimit - settledGross;
            uint256 sharesToSettle = request.shares;
            if (fullGross > remainingCapacity) {
                sharesToSettle = (remainingCapacity * supply) / currentNav;
                if (sharesToSettle == 0) break;
            }

            uint256 requestSharesBefore = request.shares;
            uint256 chunkMinimumNet = (request.minimumNet * sharesToSettle) / requestSharesBefore;
            address account = request.account;
            uint256 gross = _liquidateProRata(account, sharesToSettle, supply);
            uint256 fee = (gross * FEE_BPS) / BPS;
            uint256 net = gross - fee;
            require(net >= chunkMinimumNet, "proceeds below minimum");

            request.shares -= sharesToSettle;
            request.minimumNet -= chunkMinimumNet;
            if (request.shares == 0) {
                request.pending = false;
                pendingRedemptionByAccount[account] = 0;
            }
            _burn(address(this), sharesToSettle);
            _routeFee(fee);
            require(usdg.transfer(account, net), "redeem transfer failed");
            settledGross += gross;
            ++settled;
            emit QueuedRedemptionSettled(requestId, account, sharesToSettle, net, fee);
            if (!request.pending) ++requestId;
            else break;
        }
        nextRedemptionToProcess = requestId;
    }

    function rebalance(
        address[] calldata targetAssets,
        uint16[] calldata weights,
        bytes32 cycleHash
    ) external onlyRole(KEEPER_ROLE) nonReentrant {
        _validateTargetWeights(targetAssets, weights);
        uint256 totalNav = totalAssetsUsd();
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 targetWeight = _targetWeight(asset, targetAssets, weights);
            uint256 currentValue = assetValueUsd(asset);
            uint256 targetValue = (totalNav * targetWeight) / BPS;
            if (currentValue > targetValue) {
                uint256 valueToSell = currentValue - targetValue;
                uint256 unitPrice = _unitPrice(asset);
                uint256 sellAmount = (valueToSell * 1e18) / unitPrice;
                if (sellAmount > 0) {
                    IERC20(asset).approve(address(router), sellAmount);
                    router.sell(asset, sellAmount, (valueToSell * (BPS - maximumSlippageBps)) / BPS);
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
                if (buyValue > 0) {
                    uint256 minimumOut =
                        (buyValue * 1e18 * (BPS - maximumSlippageBps)) / (_unitPrice(asset) * BPS);
                    usdg.approve(address(router), buyValue);
                    router.buy(asset, buyValue, minimumOut);
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
                (buyValue * 1e18 * (BPS - maximumSlippageBps)) / (_unitPrice(asset) * BPS);
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
                asset, tokenAmount, (expectedValue * (BPS - maximumSlippageBps)) / BPS
            );
            gross += received;
            emit RedemptionAssetSold(account, asset, tokenAmount, received);
        }
    }

    function _quoteUsd(address asset, uint256 tokenAmount) private view returns (uint256) {
        return (tokenAmount * _unitPrice(asset)) / 1e18;
    }

    function _unitPrice(address asset) private view returns (uint256 priceWad) {
        uint256 updatedAt;
        bool valid;
        (priceWad, updatedAt, valid) = valuation.quoteStatus(asset);
        require(valid && priceWad > 0, "invalid price");
        require(
            updatedAt <= block.timestamp && block.timestamp - updatedAt <= maximumPriceAge,
            "stale price"
        );
    }

    function _validateTargetWeights(address[] calldata targetAssets, uint16[] calldata weights)
        private
        view
    {
        require(targetAssets.length == weights.length && targetAssets.length > 0, "target length");
        uint256 totalWeight;
        uint256 usdgWeight;
        for (uint256 i; i < targetAssets.length; ++i) {
            require(
                targetAssets[i] == address(usdg) || supportedAsset[targetAssets[i]],
                "unsupported asset"
            );
            for (uint256 j; j < i; ++j) {
                require(targetAssets[j] != targetAssets[i], "duplicate asset");
            }
            totalWeight += weights[i];
            if (targetAssets[i] == address(usdg)) usdgWeight = weights[i];
        }
        require(totalWeight == BPS && usdgWeight >= MIN_USDG_BPS, "invalid weights");
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
        require(usdg.transfer(creatorVault, creatorShare), "creator fee failed");
        require(usdg.transfer(automationVault, automationShare), "automation fee failed");
        usdg.approve(address(rewards), rewardShare);
        rewards.fund(rewardShare);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}

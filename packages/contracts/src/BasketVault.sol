// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILocalRouter {
    function quoteUsd(address token, uint256 tokenAmount) external view returns (uint256);
    function buy(address tokenOut, uint256 usdgIn, uint256 minimumTokenOut) external returns (uint256);
    function sell(address tokenIn, uint256 tokenInAmount, uint256 minimumUsdgOut) external returns (uint256);
}

interface IRewardFund {
    function fund(uint256 amount) external;
}

contract BasketVault is Initializable, UUPSUpgradeable, ERC20Upgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
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

    struct RedemptionRequest {
        address account;
        uint256 shares;
        uint256 minimumNet;
        uint256 deadline;
        bool pending;
    }

    IERC20 public usdg;
    ILocalRouter public router;
    IRewardFund public rewards;
    address public creatorVault;
    address public automationVault;
    address[] public assets;
    mapping(address => bool) public supportedAsset;
    uint256 public nextRedemptionRequestId;
    uint256 public nextRedemptionToProcess;
    mapping(uint256 => RedemptionRequest) public redemptionRequests;
    mapping(address => uint256) public pendingRedemptionByAccount;

    event Deposited(address indexed account, uint256 gross, uint256 shares, uint256 fee);
    event Redeemed(address indexed account, uint256 shares, uint256 net, uint256 fee);
    event RedemptionQueued(uint256 indexed requestId, address indexed account, uint256 shares, uint256 minimumNet);
    event RedemptionCancelled(uint256 indexed requestId, address indexed account, uint256 shares);
    event QueuedRedemptionSettled(uint256 indexed requestId, address indexed account, uint256 shares, uint256 net, uint256 fee);
    event Rebalanced(bytes32 indexed cycleHash, uint256 navAfter);

    function initialize(address admin, address usdg_, address router_, address rewards_, address creatorVault_, address automationVault_, address[] calldata assets_) external initializer {
        __ERC20_init("MillionDollar Basket Share", "MDBS");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
        usdg = IERC20(usdg_);
        router = ILocalRouter(router_);
        rewards = IRewardFund(rewards_);
        creatorVault = creatorVault_;
        automationVault = automationVault_;
        nextRedemptionRequestId = 1;
        nextRedemptionToProcess = 1;
        for (uint256 i; i < assets_.length; ++i) {
            supportedAsset[assets_[i]] = true;
            assets.push(assets_[i]);
        }
    }

    function nav() public view returns (uint256 total) {
        total = usdg.balanceOf(address(this));
        for (uint256 i; i < assets.length; ++i) total += router.quoteUsd(assets[i], IERC20(assets[i]).balanceOf(address(this)));
    }

    function deposit(uint256 grossAmount, uint256 minimumShares, uint256 deadline) external nonReentrant returns (uint256 shares) {
        require(block.timestamp <= deadline, "expired");
        require(grossAmount >= 10e18, "minimum deposit");
        uint256 beforeNav = nav();
        uint256 fee = (grossAmount * FEE_BPS) / BPS;
        uint256 net = grossAmount - fee;
        require(beforeNav + grossAmount <= TVL_CAP, "TVL cap");
        uint256 walletValue = totalSupply() == 0 ? 0 : (balanceOf(msg.sender) * beforeNav) / totalSupply();
        require(walletValue + net <= WALLET_VALUE_CAP, "wallet cap");
        shares = totalSupply() == 0 ? net : (net * totalSupply()) / beforeNav;
        require(shares >= minimumShares, "shares below minimum");
        require(usdg.transferFrom(msg.sender, address(this), grossAmount), "deposit transfer failed");
        _mint(msg.sender, shares);
        _routeFee(fee);
        emit Deposited(msg.sender, grossAmount, shares, fee);
    }

    function redeem(uint256 shares, uint256 minimumNet, uint256 deadline) external nonReentrant returns (uint256 net) {
        require(block.timestamp <= deadline, "expired");
        uint256 gross = (shares * nav()) / totalSupply();
        require(gross >= MIN_REDEMPTION_VALUE, "minimum redemption");
        require(gross <= (nav() * MAX_IMMEDIATE_REDEMPTION_BPS) / BPS, "queue required");
        uint256 fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
        require(net >= minimumNet, "proceeds below minimum");
        require(net <= usdg.balanceOf(address(this)), "queue required");
        require(usdg.balanceOf(address(this)) - gross >= (nav() * MIN_USDG_BPS) / BPS, "reserve required");
        _burn(msg.sender, shares);
        _routeFee(fee);
        require(usdg.transfer(msg.sender, net), "redeem transfer failed");
        emit Redeemed(msg.sender, shares, net, fee);
    }

    function canRedeemImmediately(address account, uint256 shares) public view returns (bool) {
        if (shares == 0 || totalSupply() == 0 || shares > balanceOf(account)) return false;
        uint256 currentNav = nav();
        uint256 gross = (shares * currentNav) / totalSupply();
        uint256 balance = usdg.balanceOf(address(this));
        return gross >= MIN_REDEMPTION_VALUE && gross <= (currentNav * MAX_IMMEDIATE_REDEMPTION_BPS) / BPS && gross <= balance
            && balance - gross >= ((currentNav - gross) * MIN_USDG_BPS) / BPS;
    }

    function requestRedemption(uint256 shares, uint256 minimumNet, uint256 deadline)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        require(shares > 0, "zero shares");
        require(block.timestamp <= deadline, "expired");
        require(totalSupply() > 0 && (shares * nav()) / totalSupply() >= MIN_REDEMPTION_VALUE, "minimum redemption");
        require(pendingRedemptionByAccount[msg.sender] == 0, "request already pending");
        requestId = nextRedemptionRequestId++;
        pendingRedemptionByAccount[msg.sender] = requestId;
        redemptionRequests[requestId] = RedemptionRequest(msg.sender, shares, minimumNet, deadline, true);
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

    function processRedemptions(uint256 maximumRequests) external onlyRole(KEEPER_ROLE) nonReentrant returns (uint256 settled) {
        require(maximumRequests > 0, "zero maximum");
        uint256 startingNav = nav();
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
            uint256 currentNav = nav();
            uint256 supply = totalSupply();
            uint256 fullGross = (request.shares * currentNav) / supply;
            uint256 fullNet = fullGross - ((fullGross * FEE_BPS) / BPS);
            if (fullNet < request.minimumNet || settledGross >= settlementLimit) break;
            uint256 remainingCapacity = settlementLimit - settledGross;
            uint256 shares = request.shares;
            if (fullGross > remainingCapacity) {
                shares = (remainingCapacity * supply) / currentNav;
                if (shares == 0) break;
            }
            uint256 gross = (shares * currentNav) / supply;
            uint256 fee = (gross * FEE_BPS) / BPS;
            uint256 net = gross - fee;
            uint256 requiredAfter = ((currentNav - gross) * MIN_USDG_BPS) / BPS;
            uint256 liquidRequired = gross + requiredAfter;
            uint256 balance = usdg.balanceOf(address(this));
            if (balance < liquidRequired) _liquidateToUsdg(liquidRequired - balance);
            require(usdg.balanceOf(address(this)) >= gross + requiredAfter, "insufficient liquidation");

            address account = request.account;
            request.shares -= shares;
            request.minimumNet = request.shares == 0 ? 0 : (request.minimumNet * request.shares) / (request.shares + shares);
            if (request.shares == 0) {
                request.pending = false;
                pendingRedemptionByAccount[account] = 0;
            }
            _burn(address(this), shares);
            _routeFee(fee);
            require(usdg.transfer(account, net), "queued redeem transfer failed");
            settledGross += gross;
            ++settled;
            emit QueuedRedemptionSettled(requestId, account, shares, net, fee);
            if (!request.pending) ++requestId;
            else break;
        }
        nextRedemptionToProcess = requestId;
    }

    function rebalance(address[] calldata targetAssets, uint16[] calldata weights, bytes32 cycleHash) external onlyRole(KEEPER_ROLE) nonReentrant {
        require(targetAssets.length == weights.length && targetAssets.length > 0, "target length");
        uint256 totalWeight;
        uint256 usdgWeight;
        for (uint256 i; i < targetAssets.length; ++i) {
            require(targetAssets[i] == address(usdg) || supportedAsset[targetAssets[i]], "unsupported asset");
            totalWeight += weights[i];
            if (targetAssets[i] == address(usdg)) usdgWeight = weights[i];
        }
        require(totalWeight == BPS && usdgWeight >= MIN_USDG_BPS, "invalid weights");
        uint256 totalNav = nav();
        // Sell first so the subsequent buys are funded in USDG.
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 targetWeight = _targetWeight(asset, targetAssets, weights);
            uint256 currentValue = router.quoteUsd(asset, IERC20(asset).balanceOf(address(this)));
            uint256 targetValue = (totalNav * targetWeight) / BPS;
            if (currentValue > targetValue) {
                uint256 sellAmount = ((currentValue - targetValue) * 1e18) / router.quoteUsd(asset, 1e18);
                IERC20(asset).approve(address(router), sellAmount);
                router.sell(asset, sellAmount, 0);
            }
        }
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 targetWeight = _targetWeight(asset, targetAssets, weights);
            uint256 currentValue = router.quoteUsd(asset, IERC20(asset).balanceOf(address(this)));
            uint256 targetValue = (totalNav * targetWeight) / BPS;
            if (targetValue > currentValue) {
                uint256 buyValue = targetValue - currentValue;
                usdg.approve(address(router), buyValue);
                router.buy(asset, buyValue, 0);
            }
        }
        emit Rebalanced(cycleHash, nav());
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

    function _liquidateToUsdg(uint256 valueNeeded) private {
        uint256 remaining = valueNeeded;
        for (uint256 i; i < assets.length && remaining > 0; ++i) {
            address asset = assets[i];
            uint256 tokenBalance = IERC20(asset).balanceOf(address(this));
            if (tokenBalance == 0) continue;
            uint256 assetValue = router.quoteUsd(asset, tokenBalance);
            uint256 valueToSell = assetValue < remaining ? assetValue : remaining;
            uint256 unitPrice = router.quoteUsd(asset, 1e18);
            uint256 tokenAmount = (valueToSell * 1e18 + unitPrice - 1) / unitPrice;
            if (tokenAmount > tokenBalance) tokenAmount = tokenBalance;
            IERC20(asset).approve(address(router), tokenAmount);
            uint256 received = router.sell(asset, tokenAmount, 0);
            remaining = received >= remaining ? 0 : remaining - received;
        }
        require(remaining == 0, "not enough assets");
    }

    function _targetWeight(address asset, address[] calldata targetAssets, uint16[] calldata weights) private pure returns (uint256) {
        for (uint256 i; i < targetAssets.length; ++i) if (targetAssets[i] == asset) return weights[i];
        return 0;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

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

    IERC20 public usdg;
    ILocalRouter public router;
    IRewardFund public rewards;
    address public creatorVault;
    address public automationVault;
    address[] public assets;
    mapping(address => bool) public supportedAsset;

    event Deposited(address indexed account, uint256 gross, uint256 shares, uint256 fee);
    event Redeemed(address indexed account, uint256 shares, uint256 net, uint256 fee);
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

    function _targetWeight(address asset, address[] calldata targetAssets, uint16[] calldata weights) private pure returns (uint256) {
        for (uint256 i; i < targetAssets.length; ++i) if (targetAssets[i] == asset) return weights[i];
        return 0;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

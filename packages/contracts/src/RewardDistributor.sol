// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RewardDistributor is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant BRAIN_ROLE = keccak256("BRAIN_ROLE");
    uint256 private constant ACC_SCALE = 1e24;

    IERC20 public usdg;
    address public fallbackRecipient;
    uint256 public totalOwnedWeight;
    uint256 public accRewardPerWeight;
    mapping(uint256 => uint256) public weightByPiece;
    mapping(uint256 => address) public ownerByPiece;
    mapping(uint256 => uint256) private rewardDebt;
    mapping(address => uint256) public claimable;

    event OwnerUpdated(uint256 indexed pieceId, address indexed oldOwner, address indexed newOwner);
    event Funded(uint256 amount, uint256 accRewardPerWeight);
    event Claimed(address indexed account, uint256 amount);

    function initialize(address admin, address usdg_, uint256[] calldata weights) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        usdg = IERC20(usdg_);
        fallbackRecipient = admin;
        for (uint256 i; i < weights.length; ++i) weightByPiece[i + 1] = weights[i];
    }

    function fund(uint256 amount) external {
        require(amount > 0, "zero amount");
        require(usdg.transferFrom(msg.sender, address(this), amount), "fund transfer failed");
        if (totalOwnedWeight == 0) {
            require(usdg.transfer(fallbackRecipient, amount), "fallback transfer failed");
            return;
        }
        accRewardPerWeight += (amount * ACC_SCALE) / totalOwnedWeight;
        emit Funded(amount, accRewardPerWeight);
    }

    function setOwner(uint256 pieceId, address newOwner) external onlyRole(BRAIN_ROLE) {
        address oldOwner = ownerByPiece[pieceId];
        _checkpoint(pieceId, oldOwner);
        uint256 weight = weightByPiece[pieceId];
        if (oldOwner != address(0)) totalOwnedWeight -= weight;
        ownerByPiece[pieceId] = newOwner;
        if (newOwner != address(0)) totalOwnedWeight += weight;
        rewardDebt[pieceId] = (weight * accRewardPerWeight) / ACC_SCALE;
        emit OwnerUpdated(pieceId, oldOwner, newOwner);
    }

    function claim() external returns (uint256 amount) {
        amount = claimable[msg.sender];
        require(amount > 0, "nothing claimable");
        claimable[msg.sender] = 0;
        require(usdg.transfer(msg.sender, amount), "claim transfer failed");
        emit Claimed(msg.sender, amount);
    }

    function _checkpoint(uint256 pieceId, address owner) private {
        if (owner == address(0)) return;
        uint256 accrued = (weightByPiece[pieceId] * accRewardPerWeight) / ACC_SCALE;
        uint256 debt = rewardDebt[pieceId];
        if (accrued > debt) claimable[owner] += accrued - debt;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

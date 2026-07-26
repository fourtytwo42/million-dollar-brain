// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRewardDistributor {
    function setOwner(uint256 pieceId, address newOwner) external;
    function fund(uint256 amount) external;
}

contract BrainMarketplace is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    uint256 public constant PIECE_COUNT = 42;
    uint256 public constant BPS = 10_000;
    uint256 public constant NEXT_PRICE_BPS = 12_000;

    IERC20 public usdg;
    IRewardDistributor public rewardDistributor;
    address public creatorVault;
    uint16 public catalogVersion;
    bytes32 public catalogHash;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => uint256) public settledPrice;
    mapping(uint256 => uint8) public selectedPreset;
    mapping(uint256 => uint16) public immutableWeight;
    mapping(uint256 => bytes32) public affinityId;

    event PiecePurchased(uint256 indexed pieceId, address indexed buyer, address indexed seller, uint256 paid, uint256 nextPrice);
    event PresetChanged(uint256 indexed pieceId, uint8 preset, address indexed owner);

    function initialize(
        address admin,
        address usdg_,
        address rewardDistributor_,
        address creatorVault_,
        uint16[] calldata weights,
        uint256 initialBrainValuation,
        uint16 catalogVersion_,
        bytes32 catalogHash_
    ) external initializer {
        require(weights.length == PIECE_COUNT, "weights length");
        require(catalogVersion_ > 0 && catalogHash_ != bytes32(0), "catalog");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        usdg = IERC20(usdg_);
        rewardDistributor = IRewardDistributor(rewardDistributor_);
        creatorVault = creatorVault_;
        catalogVersion = catalogVersion_;
        catalogHash = catalogHash_;
        uint256 totalWeight;
        for (uint256 i; i < PIECE_COUNT; ++i) totalWeight += weights[i];
        require(totalWeight == BPS, "weights total");
        for (uint256 i; i < PIECE_COUNT; ++i) {
            uint256 id = i + 1;
            immutableWeight[id] = weights[i];
            affinityId[id] = keccak256(abi.encode("MDBP_AFFINITY", id));
            settledPrice[id] = (initialBrainValuation * weights[i]) / BPS;
            selectedPreset[id] = 1;
        }
    }

    function currentPrice(uint256 pieceId) public view returns (uint256) {
        _validPiece(pieceId);
        uint256 price = settledPrice[pieceId];
        return ownerOf[pieceId] == address(0) ? price : (price * NEXT_PRICE_BPS) / BPS;
    }

    function buy(uint256 pieceId, uint256 maximumPrice, uint256 deadline) external {
        _validPiece(pieceId);
        require(block.timestamp <= deadline, "expired");
        address seller = ownerOf[pieceId];
        require(seller != msg.sender, "self purchase");
        uint256 paid = currentPrice(pieceId);
        require(paid <= maximumPrice, "price changed");
        require(usdg.transferFrom(msg.sender, address(this), paid), "payment failed");

        if (seller == address(0)) {
            require(usdg.transfer(creatorVault, paid), "creator transfer failed");
        } else {
            uint256 priorPrice = settledPrice[pieceId];
            uint256 markup = paid - priorPrice;
            require(usdg.transfer(seller, priorPrice), "seller transfer failed");
            uint256 creatorShare = markup / 2;
            require(usdg.transfer(creatorVault, creatorShare), "creator transfer failed");
            // Remove the transferred piece before funding so neither seller nor buyer receives its own sale reward.
            rewardDistributor.setOwner(pieceId, address(0));
            usdg.approve(address(rewardDistributor), markup - creatorShare);
            rewardDistributor.fund(markup - creatorShare);
        }

        ownerOf[pieceId] = msg.sender;
        settledPrice[pieceId] = paid;
        rewardDistributor.setOwner(pieceId, msg.sender);
        emit PiecePurchased(pieceId, msg.sender, seller, paid, currentPrice(pieceId));
    }

    function setPreset(uint256 pieceId, uint8 preset) external {
        _validPiece(pieceId);
        require(ownerOf[pieceId] == msg.sender, "not owner");
        require(preset <= 2, "invalid preset");
        selectedPreset[pieceId] = preset;
        emit PresetChanged(pieceId, preset, msg.sender);
    }

    function _validPiece(uint256 pieceId) private pure {
        require(pieceId > 0 && pieceId <= PIECE_COUNT, "invalid piece");
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {
    ERC721Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRewardDistributor {
    function setOwner(uint256 pieceId, address newOwner) external;
    function fund(uint256 amount) external;
}

contract BrainMarketplace is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ERC721Upgradeable
{
    uint256 public constant PIECE_COUNT = 42;
    uint256 public constant BPS = 10_000;
    uint256 public constant NEXT_PRICE_BPS = 12_000;

    IERC20 public usdg;
    IRewardDistributor public rewardDistributor;
    address public creatorVault;
    uint16 public catalogVersion;
    bytes32 public catalogHash;
    mapping(uint256 => uint256) public settledPrice;
    mapping(uint256 => uint8) public selectedPreset;
    mapping(uint256 => uint16) public immutableWeight;
    mapping(uint256 => bytes32) public affinityId;
    // Appended storage for the one-portrait-change-per-ownership feature.
    mapping(uint256 => bytes32) public portraitHash;
    mapping(uint256 => uint64) public ownershipSerial;
    mapping(uint256 => uint64) public portraitChangeSerialPlusOne;
    bool public marketControlsConfigured;
    bool public purchasesEnabled;
    // Appended storage for the combined one-profile-change-per-ownership feature.
    mapping(uint256 => string) public customName;
    // Appended storage for the optional owner profile link.
    mapping(uint256 => string) public profileUrl;

    event PiecePurchased(
        uint256 indexed pieceId,
        address indexed buyer,
        address indexed seller,
        uint256 paid,
        uint256 nextPrice
    );
    event PresetChanged(uint256 indexed pieceId, uint8 preset, address indexed owner);
    event ProfileChanged(
        uint256 indexed pieceId,
        address indexed owner,
        uint64 indexed ownershipSerial,
        bytes32 portraitHash,
        string customName,
        string profileUrl
    );
    event PortraitModerated(
        uint256 indexed pieceId,
        address indexed moderator,
        address indexed owner,
        uint64 ownershipSerial
    );
    event ProfileUrlModerated(
        uint256 indexed pieceId,
        address indexed moderator,
        address indexed owner,
        uint64 ownershipSerial
    );
    event PurchaseControlConfigured(bool purchasesEnabled);

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
        __ERC721_init("MillionDollar Brain Pieces", "MDBP");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        usdg = IERC20(usdg_);
        rewardDistributor = IRewardDistributor(rewardDistributor_);
        creatorVault = creatorVault_;
        catalogVersion = catalogVersion_;
        catalogHash = catalogHash_;
        uint256 totalWeight;
        for (uint256 i; i < PIECE_COUNT; ++i) {
            totalWeight += weights[i];
        }
        require(totalWeight == BPS, "weights total");
        for (uint256 i; i < PIECE_COUNT; ++i) {
            uint256 id = i + 1;
            immutableWeight[id] = weights[i];
            affinityId[id] = keccak256(abi.encode("MDBP_AFFINITY", id));
            settledPrice[id] = (initialBrainValuation * weights[i]) / BPS;
            selectedPreset[id] = 2;
            _mint(address(this), id);
        }
    }

    function currentPrice(uint256 pieceId) public view returns (uint256) {
        _validPiece(pieceId);
        uint256 price = settledPrice[pieceId];
        return isUnowned(pieceId) ? price : (price * NEXT_PRICE_BPS) / BPS;
    }

    function isUnowned(uint256 pieceId) public view returns (bool) {
        _validPiece(pieceId);
        return ownerOf(pieceId) == address(this);
    }

    function buy(uint256 pieceId, uint256 maximumPrice, uint256 deadline) external {
        require(!marketControlsConfigured || purchasesEnabled, "purchases disabled");
        _validPiece(pieceId);
        require(block.timestamp <= deadline, "expired");
        address seller = ownerOf(pieceId);
        require(seller != msg.sender, "self purchase");
        uint256 paid = currentPrice(pieceId);
        require(paid <= maximumPrice, "price changed");
        require(usdg.transferFrom(msg.sender, address(this), paid), "payment failed");

        if (seller == address(this)) {
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

        settledPrice[pieceId] = paid;
        ownershipSerial[pieceId] += 1;
        _transfer(seller, msg.sender, pieceId);
        rewardDistributor.setOwner(pieceId, msg.sender);
        emit PiecePurchased(pieceId, msg.sender, seller, paid, currentPrice(pieceId));
    }

    function setPreset(uint256 pieceId, uint8 preset) external {
        _validPiece(pieceId);
        require(ownerOf(pieceId) == msg.sender, "not owner");
        require(preset <= 4, "invalid preset");
        selectedPreset[pieceId] = preset;
        emit PresetChanged(pieceId, preset, msg.sender);
    }

    function canChangePortrait(uint256 pieceId, address account) public view returns (bool) {
        _validPiece(pieceId);
        if (account == address(0) || ownerOf(pieceId) != account || account == address(this)) {
            return false;
        }
        return portraitChangeSerialPlusOne[pieceId] != ownershipSerial[pieceId] + 1;
    }

    function canChangeProfile(uint256 pieceId, address account) public view returns (bool) {
        return canChangePortrait(pieceId, account);
    }

    function setProfile(uint256 pieceId, bytes32 newPortraitHash, string calldata newName)
        external
    {
        _setProfile(pieceId, newPortraitHash, newName, "");
    }

    function setProfile(
        uint256 pieceId,
        bytes32 newPortraitHash,
        string calldata newName,
        string calldata newProfileUrl
    ) external {
        _setProfile(pieceId, newPortraitHash, newName, newProfileUrl);
    }

    function _setProfile(
        uint256 pieceId,
        bytes32 newPortraitHash,
        string memory newName,
        string memory newProfileUrl
    ) private {
        _validPiece(pieceId);
        require(ownerOf(pieceId) == msg.sender, "not owner");
        require(newPortraitHash != bytes32(0), "empty portrait");
        require(canChangeProfile(pieceId, msg.sender), "profile already changed");
        _validateName(newName);
        _validateProfileUrl(newProfileUrl);

        portraitHash[pieceId] = newPortraitHash;
        customName[pieceId] = newName;
        profileUrl[pieceId] = newProfileUrl;
        portraitChangeSerialPlusOne[pieceId] = ownershipSerial[pieceId] + 1;
        emit ProfileChanged(
            pieceId, msg.sender, ownershipSerial[pieceId], newPortraitHash, newName, newProfileUrl
        );
    }

    function resetPortrait(uint256 pieceId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validPiece(pieceId);
        portraitHash[pieceId] = bytes32(0);
        emit PortraitModerated(pieceId, msg.sender, ownerOf(pieceId), ownershipSerial[pieceId]);
    }

    function resetProfileUrl(uint256 pieceId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validPiece(pieceId);
        profileUrl[pieceId] = "";
        emit ProfileUrlModerated(pieceId, msg.sender, ownerOf(pieceId), ownershipSerial[pieceId]);
    }

    function reinitializeV2(bool purchasesEnabled_)
        external
        reinitializer(2)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setPurchaseControl(purchasesEnabled_);
    }

    function setPurchasesEnabled(bool purchasesEnabled_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(marketControlsConfigured, "controls not configured");
        _setPurchaseControl(purchasesEnabled_);
    }

    function _validPiece(uint256 pieceId) private pure {
        require(pieceId > 0 && pieceId <= PIECE_COUNT, "invalid piece");
    }

    function _validateName(string memory value) private pure {
        bytes memory raw = bytes(value);
        require(raw.length > 0, "empty name");
        require(raw.length <= 48, "name too long");
        require(raw[0] != 0x20 && raw[raw.length - 1] != 0x20, "name whitespace");
        for (uint256 i; i < raw.length; ++i) {
            uint8 character = uint8(raw[i]);
            require(character >= 0x20 && character != 0x7f, "invalid name");
        }
    }

    function _validateProfileUrl(string memory value) private pure {
        bytes memory raw = bytes(value);
        if (raw.length == 0) return;
        require(raw.length <= 200, "url too long");
        require(
            raw.length >= 8 && raw[0] == "h" && raw[1] == "t" && raw[2] == "t" && raw[3] == "p"
                && raw[4] == "s" && raw[5] == ":" && raw[6] == "/" && raw[7] == "/",
            "invalid url"
        );
        for (uint256 i; i < raw.length; ++i) {
            uint8 character = uint8(raw[i]);
            require(character >= 0x21 && character <= 0x7e, "invalid url");
        }
    }

    function transferFrom(address, address, uint256) public pure override {
        revert("use marketplace");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("use marketplace");
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlUpgradeable, ERC721Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }

    function _setPurchaseControl(bool purchasesEnabled_) private {
        marketControlsConfigured = true;
        purchasesEnabled = purchasesEnabled_;
        emit PurchaseControlConfigured(purchasesEnabled_);
    }
}

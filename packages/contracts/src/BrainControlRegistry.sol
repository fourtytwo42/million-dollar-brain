// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

interface IBrainControlOwner {
    function ownerOf(uint256 pieceId) external view returns (address);
    function selectedPreset(uint256 pieceId) external view returns (uint8);
}

interface IBrainControlAssets {
    function isActiveId(uint32 id) external view returns (bool);
    function hasTag(uint32 id, bytes32 tag) external view returns (bool);
}

/// @notice Versioned, bounded steering bundles for the 42 Braincells collection.
/// @dev Scalar values occupy twelve uint16 slots in scalarPack. Asset identities occupy
///      four uint32 slots in assetPack. Zero is the empty asset sentinel.
contract BrainControlRegistry is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    uint256 public constant PIECE_COUNT = 42;
    uint16 public constant CONTROL_SCHEMA_VERSION = 1;

    struct StoredBundle {
        bytes32 scalarPack;
        bytes32 assetPack;
        bytes32 bundleHash;
        uint64 selectionVersion;
        uint64 updatedAt;
        bool initialized;
    }

    IBrainControlOwner public brain;
    IBrainControlAssets public assetRegistry;
    bytes32 public catalogHash;
    bool public catalogFinalized;
    mapping(uint256 pieceId => bytes32 scalarMaxPack) public scalarMaximums;
    mapping(uint256 pieceId => uint8 scalarCount) public scalarCounts;
    mapping(uint256 pieceId => bytes32 requiredAssetTag) public requiredAssetTags;
    mapping(uint256 pieceId => StoredBundle bundle) private _bundles;

    event PieceSchemaConfigured(
        uint256 indexed pieceId, uint8 scalarCount, bytes32 scalarMaximums, bytes32 requiredAssetTag
    );
    event CatalogFinalized(uint16 indexed schemaVersion, bytes32 indexed catalogHash);
    event LegacyBundleMigrated(
        uint256 indexed pieceId, uint8 indexed legacyPreset, bytes32 bundleHash
    );
    event ControlBundleChanged(
        uint256 indexed pieceId,
        address indexed owner,
        uint16 indexed schemaVersion,
        uint64 selectionVersion,
        bytes32 scalarPack,
        bytes32 assetPack,
        bytes32 bundleHash
    );

    function initialize(address admin, address brain_, address assetRegistry_, bytes32 catalogHash_)
        external
        initializer
    {
        require(admin != address(0), "zero admin");
        require(brain_ != address(0), "zero brain");
        require(assetRegistry_ != address(0), "zero asset registry");
        require(catalogHash_ != bytes32(0), "zero catalog hash");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        brain = IBrainControlOwner(brain_);
        assetRegistry = IBrainControlAssets(assetRegistry_);
        catalogHash = catalogHash_;
    }

    function configurePieceSchemas(
        uint256[] calldata pieceIds,
        uint8[] calldata counts,
        bytes32[] calldata maximumPacks,
        bytes32[] calldata assetTags
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!catalogFinalized, "catalog finalized");
        require(
            pieceIds.length == counts.length && counts.length == maximumPacks.length
                && maximumPacks.length == assetTags.length,
            "length mismatch"
        );
        for (uint256 i; i < pieceIds.length; ++i) {
            uint256 pieceId = pieceIds[i];
            _validPiece(pieceId);
            require(counts[i] > 0 && counts[i] <= 12, "invalid scalar count");
            require(scalarCounts[pieceId] == 0, "schema already configured");
            scalarCounts[pieceId] = counts[i];
            scalarMaximums[pieceId] = maximumPacks[i];
            requiredAssetTags[pieceId] = assetTags[i];
            emit PieceSchemaConfigured(pieceId, counts[i], maximumPacks[i], assetTags[i]);
        }
    }

    function finalizeCatalog() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!catalogFinalized, "catalog finalized");
        for (uint256 pieceId = 1; pieceId <= PIECE_COUNT; ++pieceId) {
            require(scalarCounts[pieceId] > 0, "piece schema missing");
        }
        catalogFinalized = true;
        emit CatalogFinalized(CONTROL_SCHEMA_VERSION, catalogHash);
    }

    function migrateLegacyBundles(
        uint256[] calldata pieceIds,
        uint8[] calldata legacyPresets,
        bytes32[] calldata scalarPacks,
        bytes32[] calldata assetPacks
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(catalogFinalized, "catalog not finalized");
        require(
            pieceIds.length == legacyPresets.length && legacyPresets.length == scalarPacks.length
                && scalarPacks.length == assetPacks.length,
            "length mismatch"
        );
        for (uint256 i; i < pieceIds.length; ++i) {
            uint256 pieceId = pieceIds[i];
            require(!_bundles[pieceId].initialized, "piece already migrated");
            require(brain.selectedPreset(pieceId) == legacyPresets[i], "legacy preset changed");
            _store(pieceId, address(0), scalarPacks[i], assetPacks[i]);
            emit LegacyBundleMigrated(pieceId, legacyPresets[i], _bundles[pieceId].bundleHash);
        }
    }

    function setControlBundle(uint256 pieceId, bytes32 scalarPack, bytes32 assetPack) external {
        require(catalogFinalized, "catalog not finalized");
        require(_bundles[pieceId].initialized, "piece not migrated");
        require(brain.ownerOf(pieceId) == msg.sender, "not owner");
        _store(pieceId, msg.sender, scalarPack, assetPack);
    }

    function controlBundle(uint256 pieceId)
        external
        view
        returns (
            uint16 schemaVersion,
            bytes32 scalarPack,
            bytes32 assetPack,
            bytes32 bundleHash,
            uint64 selectionVersion,
            uint64 updatedAt
        )
    {
        _validPiece(pieceId);
        StoredBundle storage bundle = _bundles[pieceId];
        require(bundle.initialized, "piece not migrated");
        return (
            CONTROL_SCHEMA_VERSION,
            bundle.scalarPack,
            bundle.assetPack,
            bundle.bundleHash,
            bundle.selectionVersion,
            bundle.updatedAt
        );
    }

    function validateBundle(uint256 pieceId, bytes32 scalarPack, bytes32 assetPack)
        external
        view
        returns (bytes32)
    {
        _validate(pieceId, scalarPack, assetPack);
        return _hash(pieceId, scalarPack, assetPack);
    }

    function _store(uint256 pieceId, address owner, bytes32 scalarPack, bytes32 assetPack) private {
        _validate(pieceId, scalarPack, assetPack);
        StoredBundle storage bundle = _bundles[pieceId];
        bundle.scalarPack = scalarPack;
        bundle.assetPack = assetPack;
        bundle.bundleHash = _hash(pieceId, scalarPack, assetPack);
        bundle.selectionVersion += 1;
        bundle.updatedAt = uint64(block.timestamp);
        bundle.initialized = true;
        emit ControlBundleChanged(
            pieceId,
            owner,
            CONTROL_SCHEMA_VERSION,
            bundle.selectionVersion,
            scalarPack,
            assetPack,
            bundle.bundleHash
        );
    }

    function _validate(uint256 pieceId, bytes32 scalarPack, bytes32 assetPack) private view {
        _validPiece(pieceId);
        uint8 count = scalarCounts[pieceId];
        require(count > 0, "piece schema missing");
        bytes32 maximumPack = scalarMaximums[pieceId];
        for (uint256 i; i < 12; ++i) {
            uint16 value = _scalarAt(scalarPack, i);
            uint16 maximum = _scalarAt(maximumPack, i);
            if (i < count) {
                require(value <= maximum, "scalar out of range");
            } else {
                require(value == 0, "unused scalar");
            }
        }

        if (pieceId == 42) {
            uint256 total;
            for (uint256 i; i < 8; ++i) {
                total += _scalarAt(scalarPack, i);
            }
            require(total == 100, "attention total");
        }

        bytes32 requiredTag = requiredAssetTags[pieceId];
        if (requiredTag == bytes32(0)) {
            require(assetPack == bytes32(0), "assets not allowed");
            return;
        }

        uint32 favoriteOne = _assetAt(assetPack, 0);
        uint32 favoriteTwo = _assetAt(assetPack, 1);
        uint32 favoriteThree = _assetAt(assetPack, 2);
        uint32 directiveAsset = _assetAt(assetPack, 3);
        require(
            favoriteOne == 0 || favoriteTwo == 0 || favoriteOne != favoriteTwo, "duplicate favorite"
        );
        require(
            favoriteOne == 0 || favoriteThree == 0 || favoriteOne != favoriteThree,
            "duplicate favorite"
        );
        require(
            favoriteTwo == 0 || favoriteThree == 0 || favoriteTwo != favoriteThree,
            "duplicate favorite"
        );
        uint16 directive = _scalarAt(scalarPack, 4);
        require((directive == 0) == (directiveAsset == 0), "directive asset mismatch");
        for (uint256 i; i < 4; ++i) {
            uint32 assetId = _assetAt(assetPack, i);
            if (assetId == 0) continue;
            require(assetRegistry.isActiveId(assetId), "inactive asset");
            require(assetRegistry.hasTag(assetId, requiredTag), "asset tag mismatch");
        }
    }

    function _scalarAt(bytes32 pack, uint256 index) private pure returns (uint16) {
        return uint16(uint256(pack) >> (index * 16));
    }

    function _assetAt(bytes32 pack, uint256 index) private pure returns (uint32) {
        return uint32(uint256(pack) >> (index * 32));
    }

    function _hash(uint256 pieceId, bytes32 scalarPack, bytes32 assetPack)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(CONTROL_SCHEMA_VERSION, pieceId, scalarPack, assetPack, catalogHash)
        );
    }

    function _validPiece(uint256 pieceId) private pure {
        require(pieceId > 0 && pieceId <= PIECE_COUNT, "invalid piece");
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}

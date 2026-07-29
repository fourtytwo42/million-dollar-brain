// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { BrainControlRegistry } from "../src/BrainControlRegistry.sol";

contract MockControlBrain {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => uint8) public selectedPreset;

    function setOwner(uint256 pieceId, address owner) external {
        ownerOf[pieceId] = owner;
    }

    function setPreset(uint256 pieceId, uint8 preset) external {
        selectedPreset[pieceId] = preset;
    }
}

contract MockControlAssets {
    mapping(uint32 => bool) public active;
    mapping(uint32 => mapping(bytes32 => bool)) public tags;

    function setAsset(uint32 id, bytes32 tag, bool enabled) external {
        active[id] = enabled;
        tags[id][tag] = enabled;
    }

    function isActiveId(uint32 id) external view returns (bool) {
        return active[id];
    }

    function hasTag(uint32 id, bytes32 tag) external view returns (bool) {
        return tags[id][tag];
    }
}

contract BrainControlRegistryTest is Test {
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    bytes32 internal constant TECHNOLOGY = keccak256("technology");

    BrainControlRegistry internal controls;
    MockControlBrain internal brain;
    MockControlAssets internal assets;

    function setUp() public {
        brain = new MockControlBrain();
        assets = new MockControlAssets();
        BrainControlRegistry implementation = new BrainControlRegistry();
        controls = BrainControlRegistry(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(
                        BrainControlRegistry.initialize,
                        (admin, address(brain), address(assets), keccak256("CONTROL_CATALOG_V1"))
                    )
                )
            )
        );

        uint256[] memory ids = new uint256[](42);
        uint8[] memory counts = new uint8[](42);
        bytes32[] memory maxima = new bytes32[](42);
        bytes32[] memory tags = new bytes32[](42);
        for (uint256 i; i < 42; ++i) {
            ids[i] = i + 1;
            counts[i] = 1;
            maxima[i] = _scalarPack(_values(4));
        }
        counts[18] = 5;
        maxima[18] = _scalarPack(_values(4, 4, 3, 3, 7));
        tags[18] = TECHNOLOGY;
        counts[41] = 12;
        maxima[41] = _scalarPack(_values(100, 100, 100, 100, 100, 100, 100, 100, 2, 127, 3, 3));

        vm.startPrank(admin);
        controls.configurePieceSchemas(ids, counts, maxima, tags);
        controls.finalizeCatalog();
        vm.stopPrank();

        brain.setOwner(19, alice);
        brain.setPreset(19, 2);
        brain.setOwner(42, alice);
        brain.setPreset(42, 2);
        assets.setAsset(11, TECHNOLOGY, true);
        assets.setAsset(12, keccak256("financials"), true);

        uint256[] memory migrateIds = new uint256[](2);
        migrateIds[0] = 19;
        migrateIds[1] = 42;
        uint8[] memory presets = new uint8[](2);
        presets[0] = 2;
        presets[1] = 2;
        bytes32[] memory scalarPacks = new bytes32[](2);
        scalarPacks[0] = _scalarPack(_values(2, 2, 0, 0, 0));
        scalarPacks[1] = _scalarPack(_values(20, 15, 10, 10, 15, 10, 10, 10, 1, 88, 3, 3));
        bytes32[] memory assetPacks = new bytes32[](2);
        vm.prank(admin);
        controls.migrateLegacyBundles(migrateIds, presets, scalarPacks, assetPacks);
    }

    function testOwnerUpdatesCompleteBundleAndVersion() public {
        bytes32 scalarPack = _scalarPack(_values(3, 3, 1, 1, 2));
        bytes32 assetPack = _assetPack(11, 0, 0, 11);
        vm.prank(alice);
        controls.setControlBundle(19, scalarPack, assetPack);

        (
            uint16 schemaVersion,
            bytes32 storedScalars,
            bytes32 storedAssets,
            bytes32 bundleHash,
            uint64 selectionVersion,
        ) = controls.controlBundle(19);
        assertEq(schemaVersion, 1);
        assertEq(storedScalars, scalarPack);
        assertEq(storedAssets, assetPack);
        assertEq(selectionVersion, 2);
        assertEq(bundleHash, controls.validateBundle(19, scalarPack, assetPack));
    }

    function testNonOwnerAndInvalidValuesRevert() public {
        bytes32 validScalars = _scalarPack(_values(3, 3, 1, 1, 2));
        bytes32 validAssets = _assetPack(11, 0, 0, 11);
        vm.prank(bob);
        vm.expectRevert("not owner");
        controls.setControlBundle(19, validScalars, validAssets);

        vm.prank(alice);
        vm.expectRevert("scalar out of range");
        controls.setControlBundle(19, _scalarPack(_values(5, 3, 1, 1, 2)), validAssets);

        vm.prank(alice);
        vm.expectRevert("duplicate favorite");
        controls.setControlBundle(19, validScalars, _assetPack(11, 11, 0, 11));

        vm.prank(alice);
        vm.expectRevert("asset tag mismatch");
        controls.setControlBundle(19, validScalars, _assetPack(12, 0, 0, 12));
    }

    function testDataDietAttentionMustTotalOneHundred() public {
        vm.prank(alice);
        vm.expectRevert("attention total");
        controls.setControlBundle(
            42, _scalarPack(_values(20, 15, 10, 10, 15, 10, 10, 9, 1, 88, 3, 3)), bytes32(0)
        );
    }

    function testLegacyPresetMustMatchDuringMigration() public {
        brain.setOwner(1, alice);
        brain.setPreset(1, 4);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint8[] memory presets = new uint8[](1);
        presets[0] = 2;
        bytes32[] memory scalars = new bytes32[](1);
        scalars[0] = _scalarPack(_values(2));
        bytes32[] memory assetPacks = new bytes32[](1);
        vm.prank(admin);
        vm.expectRevert("legacy preset changed");
        controls.migrateLegacyBundles(ids, presets, scalars, assetPacks);
    }

    function _scalarPack(uint16[] memory values) private pure returns (bytes32 pack) {
        uint256 raw;
        for (uint256 i; i < values.length; ++i) {
            raw |= uint256(values[i]) << (i * 16);
        }
        return bytes32(raw);
    }

    function _assetPack(uint32 one, uint32 two, uint32 three, uint32 four)
        private
        pure
        returns (bytes32)
    {
        return bytes32(
            uint256(one) | (uint256(two) << 32) | (uint256(three) << 64) | (uint256(four) << 96)
        );
    }

    function _values(uint16 a) private pure returns (uint16[] memory values) {
        values = new uint16[](1);
        values[0] = a;
    }

    function _values(uint16 a, uint16 b, uint16 c, uint16 d, uint16 e)
        private
        pure
        returns (uint16[] memory values)
    {
        values = new uint16[](5);
        values[0] = a;
        values[1] = b;
        values[2] = c;
        values[3] = d;
        values[4] = e;
    }

    function _values(
        uint16 a,
        uint16 b,
        uint16 c,
        uint16 d,
        uint16 e,
        uint16 f,
        uint16 g,
        uint16 h,
        uint16 i,
        uint16 j,
        uint16 k,
        uint16 l
    ) private pure returns (uint16[] memory values) {
        values = new uint16[](12);
        values[0] = a;
        values[1] = b;
        values[2] = c;
        values[3] = d;
        values[4] = e;
        values[5] = f;
        values[6] = g;
        values[7] = h;
        values[8] = i;
        values[9] = j;
        values[10] = k;
        values[11] = l;
    }
}

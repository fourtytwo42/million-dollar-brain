// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { BrainControlRegistry } from "../src/BrainControlRegistry.sol";

contract UpgradeBrainControls is Script {
    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "unsupported chain");
        address admin = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address brainProxy = vm.envAddress("MDB_BRAIN");
        address[] memory assets = vm.envAddress("MDB_CONTROL_ASSETS", ",");
        uint256[] memory rawIds = vm.envUint("MDB_CONTROL_ASSET_IDS", ",");
        require(admin != address(0) && brainProxy != address(0), "zero address");
        require(assets.length == rawIds.length && assets.length > 0, "asset length");

        string memory payload =
            vm.readFile(string.concat(vm.projectRoot(), "/deployments/control-catalog-v1.json"));
        bytes32 catalogHash = vm.parseJsonBytes32(payload, ".catalogHash");
        uint256[] memory rawPieceIds = vm.parseJsonUintArray(payload, ".pieceIds");
        uint256[] memory rawCounts = vm.parseJsonUintArray(payload, ".scalarCounts");
        bytes32[] memory maximumPacks = vm.parseJsonBytes32Array(payload, ".scalarMaximumPacks");
        bytes32[] memory requiredTags = vm.parseJsonBytes32Array(payload, ".requiredAssetTags");
        bytes32[] memory migrationScalars =
            vm.parseJsonBytes32Array(payload, ".migrationScalarPacks");
        bytes32[] memory migrationAssets = vm.parseJsonBytes32Array(payload, ".migrationAssetPacks");

        vm.startBroadcast();
        AssetRegistry registry = _upgradeOrDeployAssetRegistry(admin, assets);
        _configureAssets(registry, assets, rawIds);

        BrainControlRegistry controlImplementation = new BrainControlRegistry();
        ERC1967Proxy controlProxy = new ERC1967Proxy(
            address(controlImplementation),
            abi.encodeCall(
                BrainControlRegistry.initialize, (admin, brainProxy, address(registry), catalogHash)
            )
        );
        BrainControlRegistry controls = BrainControlRegistry(address(controlProxy));

        uint256[] memory pieceIds = new uint256[](rawPieceIds.length);
        uint8[] memory counts = new uint8[](rawCounts.length);
        for (uint256 i; i < rawPieceIds.length; ++i) {
            pieceIds[i] = rawPieceIds[i];
            counts[i] = uint8(rawCounts[i]);
        }
        controls.configurePieceSchemas(pieceIds, counts, maximumPacks, requiredTags);
        controls.finalizeCatalog();

        uint8[] memory legacyPresets = new uint8[](42);
        bytes32[] memory selectedScalarPacks = new bytes32[](42);
        bytes32[] memory selectedAssetPacks = new bytes32[](42);
        BrainMarketplace brain = BrainMarketplace(brainProxy);
        for (uint256 pieceId = 1; pieceId <= 42; ++pieceId) {
            uint8 preset = brain.selectedPreset(pieceId);
            legacyPresets[pieceId - 1] = preset;
            uint256 migrationIndex = (pieceId - 1) * 5 + preset;
            selectedScalarPacks[pieceId - 1] = migrationScalars[migrationIndex];
            selectedAssetPacks[pieceId - 1] = migrationAssets[migrationIndex];
        }
        controls.migrateLegacyBundles(
            pieceIds, legacyPresets, selectedScalarPacks, selectedAssetPacks
        );

        BrainMarketplace brainImplementation = new BrainMarketplace();
        brain.upgradeToAndCall(
            address(brainImplementation),
            abi.encodeCall(BrainMarketplace.reinitializeV5, (address(controls), false))
        );
        brain.setControlBundlesEnabled(true);
        vm.stopBroadcast();

        console2.log("ASSET_REGISTRY", address(registry));
        console2.log("ASSET_REGISTRY_IMPLEMENTATION", _implementationOf(address(registry)));
        console2.log("BRAIN_CONTROL_REGISTRY", address(controls));
        console2.log("BRAIN_CONTROL_IMPLEMENTATION", address(controlImplementation));
        console2.log("BRAIN_IMPLEMENTATION", address(brainImplementation));
        console2.logBytes32(catalogHash);
    }

    function _upgradeOrDeployAssetRegistry(address admin, address[] memory assets)
        private
        returns (AssetRegistry registry)
    {
        address existing = vm.envOr("MDB_ASSET_REGISTRY", address(0));
        if (existing != address(0)) {
            registry = AssetRegistry(existing);
            AssetRegistry implementation = new AssetRegistry();
            registry.upgradeToAndCall(address(implementation), "");
            return registry;
        }
        require(block.chainid == 31_337 && assets.length == 4, "registry required");
        AssetRegistry implementation = new AssetRegistry();
        registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(AssetRegistry.initialize, (admin, block.chainid))
                )
            )
        );
        _registerLocalAsset(registry, assets[0], 0, 0, address(0), address(0));
        _registerLocalAsset(registry, assets[1], 1, 1, assets[1], assets[1]);
        _registerLocalAsset(registry, assets[2], 1, 1, assets[2], assets[2]);
        _registerLocalAsset(registry, assets[3], 3, 2, assets[3], assets[3]);
    }

    function _registerLocalAsset(
        AssetRegistry registry,
        address token,
        uint8 kind,
        uint8 risk,
        address valuation,
        address execution
    ) private {
        registry.registerAsset(
            AssetRegistry.AssetRecord({
                token: token,
                robinhoodUid: bytes32(0),
                kind: AssetRegistry.AssetKind(kind),
                riskClass: AssetRegistry.RiskClass(risk),
                valuationAdapter: valuation,
                executionAdapter: execution,
                circulatingSupplyAdapter: kind >= 3 ? token : address(0),
                maximumWeightBps: 2_000,
                registered: false,
                active: false
            })
        );
        registry.recordQualification(
            token,
            AssetRegistry.AssetQualification({
                evidenceHash: keccak256(abi.encode("42BC_DEVNET_CONTROL_V1", token)),
                observedAt: uint64(block.timestamp),
                validUntil: uint64(block.timestamp + 365 days),
                consecutiveHours: 48,
                regularMarketSessions: kind == 1 || kind == 2 ? 2 : 0,
                marketCapOrAumUsdWad: uint128(1_000_000_000e18),
                executableDepthUsdWad: uint128(10_000_000e18),
                identityValid: true,
                oracleValid: true,
                liquidityValid: true,
                transferBehaviorValid: true,
                corporateActionClear: true
            })
        );
        registry.setActive(token, true);
    }

    function _configureAssets(
        AssetRegistry registry,
        address[] memory assets,
        uint256[] memory rawIds
    ) private {
        for (uint256 i; i < assets.length; ++i) {
            uint32 id = uint32(rawIds[i]);
            require(id != 0 && id <= 12, "invalid stable id");
            registry.configureAssetIdentity(assets[i], id, _tagsFor(id));
        }
    }

    function _tagsFor(uint32 id) private pure returns (bytes32[] memory tags) {
        if (id == 1) return _one("reserve");
        if (id == 2) return _one("technology");
        if (id == 3 || id == 4) return _two("technology", "ai_semiconductor");
        if (id == 5) return _two("technology", "consumer_discretionary");
        if (id == 6 || id == 7) return _two("technology", "communications");
        if (id == 8) return _one("consumer_discretionary");
        if (id == 9) return _one("broad_market");
        if (id == 10) return _two("broad_market", "technology");
        if (id == 11) return _three("broad_market", "technology", "ai_semiconductor");
        if (id == 12) return _one("crypto_major");
        revert("unknown stable id");
    }

    function _one(string memory a) private pure returns (bytes32[] memory values) {
        values = new bytes32[](1);
        values[0] = keccak256(bytes(a));
    }

    function _two(string memory a, string memory b) private pure returns (bytes32[] memory values) {
        values = new bytes32[](2);
        values[0] = keccak256(bytes(a));
        values[1] = keccak256(bytes(b));
    }

    function _three(string memory a, string memory b, string memory c)
        private
        pure
        returns (bytes32[] memory values)
    {
        values = new bytes32[](3);
        values[0] = keccak256(bytes(a));
        values[1] = keccak256(bytes(b));
        values[2] = keccak256(bytes(c));
    }

    function _implementationOf(address proxy) private view returns (address) {
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        return address(uint160(uint256(vm.load(proxy, slot))));
    }
}

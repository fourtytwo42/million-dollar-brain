// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { BasketVault } from "../src/BasketVault.sol";
import { CreatorRiskController } from "../src/CreatorRiskController.sol";

/// @notice Devnet/testnet-only migration for creator risk limits. Mainnet is deliberately excluded.
contract UpgradeCreatorRisk is Script {
    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "devnet/testnet only");
        require(vm.envBool("MDB_CREATOR_RISK_MIGRATION"), "migration flag required");
        address basketProxy = vm.envAddress("MDB_BASKET");
        address registryProxy = vm.envAddress("MDB_REGISTRY");
        address creator = vm.envAddress("MDB_CREATOR_RISK_AUTHORITY");
        address[] memory initiallyApproved = vm.envAddress("MDB_CREATOR_APPROVED_ASSETS", ",");
        require(
            basketProxy != address(0) && registryProxy != address(0) && creator != address(0),
            "zero address"
        );
        require(initiallyApproved.length != 0, "empty approved assets");

        vm.startBroadcast();
        CreatorRiskController controller = CreatorRiskController(
            address(
                new ERC1967Proxy(
                    address(new CreatorRiskController()),
                    abi.encodeCall(
                        CreatorRiskController.initialize,
                        (creator, basketProxy, registryProxy, uint64(48 hours))
                    )
                )
            )
        );
        AssetRegistry registry = AssetRegistry(registryProxy);
        registry.upgradeToAndCall(
            address(new AssetRegistry()),
            abi.encodeCall(AssetRegistry.reinitializeV4, (address(controller), initiallyApproved))
        );
        BasketVault basket = BasketVault(basketProxy);
        basket.upgradeToAndCall(address(new BasketVault()), "");
        basket.grantRole(keccak256("RISK_ADMIN_ROLE"), address(controller));
        vm.stopBroadcast();

        string memory root = "creatorRisk";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "creator", creator);
        vm.serializeAddress(root, "basket", basketProxy);
        vm.serializeAddress(root, "assetRegistry", registryProxy);
        string memory json = vm.serializeAddress(root, "riskController", address(controller));
        vm.writeJson(json, vm.envString("MDB_CREATOR_RISK_EVIDENCE"));
    }
}

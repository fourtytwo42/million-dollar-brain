// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";

contract UpgradeBrainProfiles is Script {
    bytes32 internal constant PROFILE_CATALOG_HASH =
        0x53528e03482ed69833c8f3c99c171fb4367f7727f167dbe797eb1058196b401f;

    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "unsupported chain");
        address proxy = vm.envAddress("MDB_BRAIN");
        require(proxy != address(0), "zero proxy");

        vm.startBroadcast();
        BrainMarketplace implementation = new BrainMarketplace();
        BrainMarketplace(proxy)
            .upgradeToAndCall(
                address(implementation),
                abi.encodeCall(
                    BrainMarketplace.reinitializeV6, (uint16(1), PROFILE_CATALOG_HASH, true, true)
                )
            );
        vm.stopBroadcast();
    }
}

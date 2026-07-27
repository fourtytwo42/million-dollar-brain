// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { BasketVault } from "../src/BasketVault.sol";
import { MockValuationOracle } from "../src/MockValuationOracle.sol";

contract UpgradeBasketV2 is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        string memory deploymentPath = string.concat(vm.projectRoot(), "/deployments/local.json");
        string memory deployment = vm.readFile(deploymentPath);
        address basketAddress = vm.parseJsonAddress(deployment, ".basket");
        address usdg = vm.parseJsonAddress(deployment, ".usdg");
        address nvda = vm.parseJsonAddress(deployment, ".nvda");
        address aapl = vm.parseJsonAddress(deployment, ".aapl");
        address ethx = vm.parseJsonAddress(deployment, ".ethx");

        vm.startBroadcast(key);
        MockValuationOracle oracle = new MockValuationOracle(deployer);
        oracle.setPrice(nvda, 180e18);
        oracle.setPrice(aapl, 220e18);
        oracle.setPrice(ethx, 3_000e18);

        address[] memory targetAssets = new address[](4);
        uint16[] memory targetWeights = new uint16[](4);
        targetAssets[0] = usdg;
        targetAssets[1] = nvda;
        targetAssets[2] = aapl;
        targetAssets[3] = ethx;
        targetWeights[0] = uint16(vm.envOr("MDB_TARGET_USDG_BPS", uint256(2_000)));
        targetWeights[1] = uint16(vm.envOr("MDB_TARGET_NVDA_BPS", uint256(4_000)));
        targetWeights[2] = uint16(vm.envOr("MDB_TARGET_AAPL_BPS", uint256(1_000)));
        targetWeights[3] = uint16(vm.envOr("MDB_TARGET_ETHX_BPS", uint256(3_000)));

        BasketVault implementation = new BasketVault();
        BasketVault basket = BasketVault(basketAddress);
        basket.upgradeToAndCall(
            address(implementation),
            abi.encodeCall(
                BasketVault.reinitializeV2, (address(oracle), 120, 100, targetAssets, targetWeights)
            )
        );
        vm.stopBroadcast();

        string memory oracleJson = string.concat("\"", vm.toString(address(oracle)), "\"");
        vm.writeJson(oracleJson, deploymentPath, ".oracle");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TestnetPricePublisher } from "../src/TestnetPricePublisher.sol";

contract DeployTestnetPublisher is Script {
    function run() external {
        require(block.chainid == 46630, "testnet only");
        address deployer = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address oracle = vm.envAddress("MDB_TESTNET_ORACLE");
        address router = vm.envAddress("MDB_TESTNET_ROUTER");
        vm.startBroadcast();
        TestnetPricePublisher publisher = new TestnetPricePublisher(deployer, oracle, router);
        Ownable(oracle).transferOwnership(address(publisher));
        Ownable(router).transferOwnership(address(publisher));
        string memory root = "publisher";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", deployer);
        string memory json = vm.serializeAddress(root, "pricePublisher", address(publisher));
        vm.writeJson(json, vm.envString("MDB_DEPLOYMENT_OUTPUT"));
        vm.stopBroadcast();
    }
}

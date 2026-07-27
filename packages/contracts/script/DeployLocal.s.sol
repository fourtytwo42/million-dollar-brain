// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { MockToken } from "../src/MockToken.sol";
import { MockRouter } from "../src/MockRouter.sol";
import { MockValuationOracle } from "../src/MockValuationOracle.sol";
import { RewardDistributor } from "../src/RewardDistributor.sol";
import { CreatorVault } from "../src/CreatorVault.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract DeployLocal is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        vm.startBroadcast(key);

        MockToken usdg = new MockToken("Mock USDG", "USDG", 18, deployer);
        MockToken nvda = new MockToken("Mock NVIDIA", "NVDA", 18, deployer);
        MockToken aapl = new MockToken("Mock Apple", "AAPL", 18, deployer);
        MockToken ethx = new MockToken("Mock Ether", "ETHX", 18, deployer);
        MockRouter router = new MockRouter(address(usdg), deployer);
        MockValuationOracle oracle = new MockValuationOracle(deployer);
        router.setPrice(address(nvda), 180e18);
        router.setPrice(address(aapl), 220e18);
        router.setPrice(address(ethx), 3_000e18);
        oracle.setPrice(address(nvda), 180e18);
        oracle.setPrice(address(aapl), 220e18);
        oracle.setPrice(address(ethx), 3_000e18);
        usdg.mint(address(router), 10_000_000e18);
        nvda.mint(address(router), 100_000e18);
        aapl.mint(address(router), 100_000e18);
        ethx.mint(address(router), 100_000e18);

        uint256[] memory weights = new uint256[](42);
        uint16[] memory brainWeights = new uint16[](42);
        for (uint256 i; i < 6; ++i) {
            brainWeights[i] = 500;
        }
        for (uint256 i = 6; i < 18; ++i) {
            brainWeights[i] = 300;
        }
        for (uint256 i = 18; i < 34; ++i) {
            brainWeights[i] = 150;
        }
        for (uint256 i = 34; i < 42; ++i) {
            brainWeights[i] = 125;
        }
        for (uint256 i; i < 42; ++i) {
            weights[i] = brainWeights[i];
        }

        CreatorVault creatorVaultImplementation = new CreatorVault();
        CreatorVault creatorVault = CreatorVault(
            address(
                new ERC1967Proxy(
                    address(creatorVaultImplementation),
                    abi.encodeCall(CreatorVault.initialize, (deployer, address(usdg)))
                )
            )
        );

        RewardDistributor rewardImplementation = new RewardDistributor();
        ERC1967Proxy rewardProxy = new ERC1967Proxy(
            address(rewardImplementation),
            abi.encodeCall(
                RewardDistributor.initialize,
                (deployer, address(usdg), weights, address(creatorVault))
            )
        );
        RewardDistributor rewards = RewardDistributor(address(rewardProxy));

        BrainMarketplace brainImplementation = new BrainMarketplace();
        ERC1967Proxy brainProxy = new ERC1967Proxy(
            address(brainImplementation),
            abi.encodeCall(
                BrainMarketplace.initialize,
                (
                    deployer,
                    address(usdg),
                    address(rewards),
                    address(creatorVault),
                    brainWeights,
                    42_000e18,
                    3,
                    keccak256("MDB_BRAIN_CATALOG_V3")
                )
            )
        );
        BrainMarketplace brain = BrainMarketplace(address(brainProxy));
        rewards.grantRole(rewards.BRAIN_ROLE(), address(brain));

        address[] memory assets = new address[](3);
        assets[0] = address(nvda);
        assets[1] = address(aapl);
        assets[2] = address(ethx);
        BasketVault basketImplementation = new BasketVault();
        ERC1967Proxy basketProxy = new ERC1967Proxy(
            address(basketImplementation),
            abi.encodeCall(
                BasketVault.initialize,
                (
                    deployer,
                    address(usdg),
                    address(router),
                    address(rewards),
                    address(creatorVault),
                    deployer,
                    assets
                )
            )
        );
        BasketVault basket = BasketVault(address(basketProxy));
        address[] memory bootstrapAssets = new address[](4);
        uint16[] memory bootstrapWeights = new uint16[](4);
        bootstrapAssets[0] = address(usdg);
        bootstrapAssets[1] = address(nvda);
        bootstrapAssets[2] = address(aapl);
        bootstrapAssets[3] = address(ethx);
        bootstrapWeights[0] = 2_000;
        bootstrapWeights[1] = 3_000;
        bootstrapWeights[2] = 2_500;
        bootstrapWeights[3] = 2_500;
        basket.reinitializeV2(address(oracle), 120, 100, bootstrapAssets, bootstrapWeights);

        usdg.mint(deployer, 1_000_000e18);
        vm.serializeAddress("local", "usdg", address(usdg));
        vm.serializeAddress("local", "nvda", address(nvda));
        vm.serializeAddress("local", "aapl", address(aapl));
        vm.serializeAddress("local", "ethx", address(ethx));
        vm.serializeAddress("local", "router", address(router));
        vm.serializeAddress("local", "oracle", address(oracle));
        vm.serializeAddress("local", "rewards", address(rewards));
        vm.serializeAddress("local", "creatorVault", address(creatorVault));
        vm.serializeAddress("local", "brain", address(brain));
        string memory output = vm.serializeAddress("local", "basket", address(basketProxy));
        vm.writeJson(output, "./deployments/local.json");
        vm.stopBroadcast();
    }
}

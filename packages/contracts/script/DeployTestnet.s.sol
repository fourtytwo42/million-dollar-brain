// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockToken} from "../src/MockToken.sol";
import {MockRouter} from "../src/MockRouter.sol";
import {MockValuationOracle} from "../src/MockValuationOracle.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {BrainMarketplace} from "../src/BrainMarketplace.sol";
import {BasketVault} from "../src/BasketVault.sol";

/// @notice Broadcast-ready chain-46630 mock-asset deployment.
/// @dev The shell release gate supplies either an isolated Anvil key or an encrypted Foundry account.
contract DeployTestnet is Script {
    function run() external {
        require(block.chainid == 46630, "testnet chain only");
        address deployer = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        require(deployer != address(0), "zero deployer");
        vm.startBroadcast();

        MockToken usdg = new MockToken("Test USDG", "tUSDG", 18, deployer);
        MockToken nvda = new MockToken("Test NVIDIA", "tNVDA", 18, deployer);
        MockToken aapl = new MockToken("Test Apple", "tAAPL", 18, deployer);
        MockToken ethx = new MockToken("Test Ether", "tETHX", 18, deployer);
        MockRouter router = new MockRouter(address(usdg), deployer);
        MockValuationOracle oracle = new MockValuationOracle(deployer);
        router.setPrice(address(nvda), 180e18);
        router.setPrice(address(aapl), 220e18);
        router.setPrice(address(ethx), 3_000e18);
        oracle.setPrice(address(nvda), 180e18);
        oracle.setPrice(address(aapl), 220e18);
        oracle.setPrice(address(ethx), 3_000e18);
        oracle.setAutomaticFreshness(false);
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
        RewardDistributor rewards = RewardDistributor(
            address(
                new ERC1967Proxy(
                    address(rewardImplementation),
                    abi.encodeCall(
                        RewardDistributor.initialize, (deployer, address(usdg), weights, address(creatorVault))
                    )
                )
            )
        );

        BrainMarketplace brainImplementation = new BrainMarketplace();
        BrainMarketplace brain = BrainMarketplace(
            address(
                new ERC1967Proxy(
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
                )
            )
        );
        rewards.grantRole(rewards.BRAIN_ROLE(), address(brain));

        address[] memory assets = new address[](3);
        assets[0] = address(nvda);
        assets[1] = address(aapl);
        assets[2] = address(ethx);
        BasketVault basketImplementation = new BasketVault();
        BasketVault basket = BasketVault(
            address(
                new ERC1967Proxy(
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
                )
            )
        );
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
        string memory root = "testnet";
        vm.serializeUint(root, "schemaVersion", 1);
        vm.serializeString(root, "environment", "robinhood-testnet");
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeBool(root, "mockOnly", true);
        vm.serializeBool(root, "automaticFreshness", false);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "usdg", address(usdg));
        vm.serializeAddress(root, "nvda", address(nvda));
        vm.serializeAddress(root, "aapl", address(aapl));
        vm.serializeAddress(root, "ethx", address(ethx));
        vm.serializeAddress(root, "router", address(router));
        vm.serializeAddress(root, "oracle", address(oracle));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "creatorVault", address(creatorVault));
        vm.serializeAddress(root, "brain", address(brain));
        string memory output = vm.serializeAddress(root, "basket", address(basket));
        vm.writeJson(output, vm.envOr("MDB_DEPLOYMENT_OUTPUT", string("./deployments/testnet.json")));
        vm.stopBroadcast();
    }
}

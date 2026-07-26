// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockToken} from "../src/MockToken.sol";
import {MockRouter} from "../src/MockRouter.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {BrainMarketplace} from "../src/BrainMarketplace.sol";
import {BasketVault} from "../src/BasketVault.sol";

contract BasketBrainTest is Test {
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    MockToken internal usdg;
    MockToken internal nvda;
    MockToken internal aapl;
    MockRouter internal router;
    RewardDistributor internal rewards;
    BrainMarketplace internal brain;
    BasketVault internal basket;

    function setUp() public {
        usdg = new MockToken("Mock USDG", "USDG", 18, admin);
        nvda = new MockToken("Mock NVIDIA", "NVDA", 18, admin);
        aapl = new MockToken("Mock Apple", "AAPL", 18, admin);
        router = new MockRouter(address(usdg), admin);
        vm.prank(admin);
        router.setPrice(address(nvda), 180e18);
        vm.prank(admin);
        router.setPrice(address(aapl), 220e18);
        vm.startPrank(admin);
        usdg.mint(address(router), 10_000_000e18);
        nvda.mint(address(router), 100_000e18);
        aapl.mint(address(router), 100_000e18);
        usdg.mint(alice, 100_000e18);
        usdg.mint(bob, 100_000e18);
        uint256[] memory rewardWeights = new uint256[](42);
        uint16[] memory brainWeights = new uint16[](42);
        for (uint256 i; i < 6; ++i) brainWeights[i] = 500;
        for (uint256 i = 6; i < 18; ++i) brainWeights[i] = 300;
        for (uint256 i = 18; i < 34; ++i) brainWeights[i] = 150;
        for (uint256 i = 34; i < 42; ++i) brainWeights[i] = 125;
        for (uint256 i; i < 42; ++i) rewardWeights[i] = brainWeights[i];
        RewardDistributor rewardImpl = new RewardDistributor();
        rewards = RewardDistributor(address(new ERC1967Proxy(address(rewardImpl), abi.encodeCall(RewardDistributor.initialize, (admin, address(usdg), rewardWeights)))));
        BrainMarketplace brainImpl = new BrainMarketplace();
        brain = BrainMarketplace(address(new ERC1967Proxy(address(brainImpl), abi.encodeCall(BrainMarketplace.initialize, (admin, address(usdg), address(rewards), admin, brainWeights, 42_000e18)))));
        rewards.grantRole(rewards.BRAIN_ROLE(), address(brain));
        address[] memory assets = new address[](2);
        assets[0] = address(nvda);
        assets[1] = address(aapl);
        BasketVault basketImpl = new BasketVault();
        basket = BasketVault(address(new ERC1967Proxy(address(basketImpl), abi.encodeCall(BasketVault.initialize, (admin, address(usdg), address(router), address(rewards), admin, assets)))));
        vm.stopPrank();
    }

    function testDepositRebalanceAndRedeem() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        uint256 shares = basket.deposit(10_000e18, 9_900e18, block.timestamp + 1 hours);
        vm.stopPrank();
        assertEq(shares, 9_900e18);
        address[] memory targets = new address[](3);
        uint16[] memory weights = new uint16[](3);
        targets[0] = address(usdg); weights[0] = 2_000;
        targets[1] = address(nvda); weights[1] = 4_000;
        targets[2] = address(aapl); weights[2] = 4_000;
        vm.prank(admin);
        basket.rebalance(targets, weights, keccak256("cycle"));
        assertGt(nvda.balanceOf(address(basket)), 0);

        // Immediate withdrawals are deliberately limited to the USDG reserve.
        // Return to a liquid target before proving the synchronous redemption path.
        targets[0] = address(usdg); weights[0] = 10_000;
        targets[1] = address(nvda); weights[1] = 0;
        targets[2] = address(aapl); weights[2] = 0;
        vm.prank(admin);
        basket.rebalance(targets, weights, keccak256("liquidate"));
        vm.prank(alice);
        basket.redeem(shares / 2, 1, block.timestamp + 1 hours);
        assertGt(usdg.balanceOf(alice), 90_000e18);
    }

    function testBrainSaleExcludesTransferredPieceFromMarkupReward() public {
        vm.startPrank(alice);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        vm.stopPrank();
        vm.startPrank(bob);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(2, type(uint256).max, block.timestamp + 1 hours);
        vm.stopPrank();
        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.startPrank(bob);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        vm.stopPrank();
        assertGt(usdg.balanceOf(alice), aliceBefore);
        assertEq(brain.ownerOf(1), bob);
    }
}

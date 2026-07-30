// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { MockToken } from "../src/MockToken.sol";
import { DexTwapValuationAdapter } from "../src/DexTwapValuationAdapter.sol";

contract TwapPoolMock {
    address public token0;
    address public token1;
    uint128 public liquidity;
    int24 public meanTick;
    int24 public spotTick;
    uint16 public cardinality;
    uint32 public observationTime;

    constructor(address tokenA, address tokenB) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        liquidity = 1_000_000;
        cardinality = 64;
        observationTime = uint32(block.timestamp);
    }

    function setState(
        int24 meanTick_,
        int24 spotTick_,
        uint128 liquidity_,
        uint16 cardinality_,
        uint32 observationTime_
    ) external {
        meanTick = meanTick_;
        spotTick = spotTick_;
        liquidity = liquidity_;
        cardinality = cardinality_;
        observationTime = observationTime_;
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory cumulatives, uint160[] memory secondsPerLiquidity)
    {
        cumulatives = new int56[](2);
        secondsPerLiquidity = new uint160[](2);
        cumulatives[0] = 0;
        cumulatives[1] = int56(meanTick) * int56(uint56(secondsAgos[0]));
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (0, spotTick, 0, cardinality, cardinality, 0, true);
    }

    function observations(uint256) external view returns (uint32, int56, uint160, bool) {
        return (observationTime, 0, 0, true);
    }
}

contract DexTwapValuationTest is Test {
    MockToken internal usdg;
    MockToken internal asset;
    MockToken internal weth;
    TwapPoolMock internal pool;
    DexTwapValuationAdapter internal adapter;

    function setUp() public {
        vm.warp(10_000);
        usdg = new MockToken("USDG", "USDG", 18, address(this));
        asset = new MockToken("Asset", "AST", 18, address(this));
        weth = new MockToken("WETH", "WETH", 18, address(this));
        pool = new TwapPoolMock(address(asset), address(usdg));
        adapter = new DexTwapValuationAdapter();
        adapter.initialize(address(this), address(usdg), address(weth), 30 minutes);
        adapter.configureRoute(
            address(asset),
            DexTwapValuationAdapter.TwapRoute({
                directPool: address(pool),
                bridgePool: address(0),
                minimumDirectLiquidity: 100,
                minimumBridgeLiquidity: 0,
                minimumObservationCardinality: 16,
                maximumObservationAge: 60,
                enabled: true
            })
        );
    }

    function testTwapIgnoresManipulatedSpotTick() public {
        int24 twapTick = address(asset) < address(usdg) ? int24(6931) : int24(-6931);
        pool.setState(twapTick, -twapTick, 1_000_000, 64, uint32(block.timestamp));
        (uint256 price,, bool valid) = adapter.quoteStatus(address(asset));
        assertTrue(valid);
        assertApproxEqRel(price, 2e18, 0.001e18);
    }

    function testRejectsStaleObservation() public {
        pool.setState(0, 0, 1_000_000, 64, uint32(block.timestamp - 61));
        (,, bool valid) = adapter.quoteStatus(address(asset));
        assertFalse(valid);
    }

    function testRejectsInsufficientCardinalityOrLiquidity() public {
        pool.setState(0, 0, 99, 64, uint32(block.timestamp));
        (,, bool lowLiquidityValid) = adapter.quoteStatus(address(asset));
        assertFalse(lowLiquidityValid);
        pool.setState(0, 0, 1_000_000, 15, uint32(block.timestamp));
        (,, bool lowCardinalityValid) = adapter.quoteStatus(address(asset));
        assertFalse(lowCardinalityValid);
    }

    function testConfiguratorCanExtendObservationAgeWithinBound() public {
        adapter.setMaximumObservationAge(address(asset), 15 minutes);
        (,,,,, uint32 maximumObservationAge,) = adapter.routes(address(asset));
        assertEq(maximumObservationAge, 15 minutes);
    }

    function testObservationAgeUpdateRejectsUnauthorizedAndOutOfRangeValues() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        adapter.setMaximumObservationAge(address(asset), 15 minutes);

        vm.expectRevert(DexTwapValuationAdapter.InvalidConfiguration.selector);
        adapter.setMaximumObservationAge(address(asset), 0);

        vm.expectRevert(DexTwapValuationAdapter.InvalidConfiguration.selector);
        adapter.setMaximumObservationAge(address(asset), 1 hours + 1);
    }
}

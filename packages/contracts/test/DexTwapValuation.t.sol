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
    int24 public longMeanTick;
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
        longMeanTick = meanTick_;
        spotTick = spotTick_;
        liquidity = liquidity_;
        cardinality = cardinality_;
        observationTime = observationTime_;
    }

    function setLongMeanTick(int24 longMeanTick_) external {
        longMeanTick = longMeanTick_;
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory cumulatives, uint160[] memory secondsPerLiquidity)
    {
        cumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidity = new uint160[](secondsAgos.length);
        uint32 longest = secondsAgos[0];
        int56 current = int56(longMeanTick) * int56(uint56(longest));
        uint256 currentLiquidity =
            (uint256(longest) << 128) / uint256(liquidity == 0 ? 1 : liquidity);
        for (uint256 i; i < secondsAgos.length; ++i) {
            uint32 age = secondsAgos[i];
            if (age == 0) {
                cumulatives[i] = current;
                secondsPerLiquidity[i] = uint160(currentLiquidity);
            } else if (age == longest) {
                cumulatives[i] = 0;
                secondsPerLiquidity[i] = 0;
            } else {
                cumulatives[i] = current - int56(meanTick) * int56(uint56(age));
                secondsPerLiquidity[i] = uint160(
                    currentLiquidity
                        - ((uint256(age) << 128) / uint256(liquidity == 0 ? 1 : liquidity))
                );
            }
        }
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

    function testIdlePoolKeepsValidTwapButReportsStaleActivity() public {
        pool.setState(0, 0, 1_000_000, 64, uint32(block.timestamp - 61));
        (
            uint256 price,
            uint256 computedAt,
            uint256 lastPoolActivityAt,
            bool activityFresh,
            bool valid
        ) = adapter.quoteEvidence(address(asset));
        assertTrue(valid);
        assertEq(price, 1e18);
        assertEq(computedAt, block.timestamp);
        assertEq(lastPoolActivityAt, block.timestamp - 61);
        assertFalse(activityFresh);

        (uint256 statusPrice, uint256 updatedAt, bool statusValid) =
            adapter.quoteStatus(address(asset));
        assertTrue(statusValid);
        assertEq(statusPrice, price);
        assertEq(updatedAt, block.timestamp);
    }

    function testRejectsFutureObservation() public {
        pool.setState(0, 0, 1_000_000, 64, uint32(block.timestamp + 1));
        (,,,, bool valid) = adapter.quoteEvidence(address(asset));
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

    function testV2RequiresShortLongTwapAgreementAndTimeWeightedLiquidity() public {
        pool.setState(0, 0, 1_000_000, 64, uint32(block.timestamp));
        adapter.reinitializeV2(4 hours);
        adapter.configureSafety(
            address(asset),
            DexTwapValuationAdapter.DexSafetyConfig({
                minimumDirectHarmonicLiquidity: 900_000,
                minimumBridgeHarmonicLiquidity: 0,
                maximumSpotToShortDeviationBps: 300,
                maximumShortToLongDeviationBps: 500,
                enabled: true
            })
        );
        (,, bool valid) = adapter.quoteStatus(address(asset));
        assertTrue(valid);

        pool.setLongMeanTick(1_000);
        (,, valid) = adapter.quoteStatus(address(asset));
        assertFalse(valid);
    }
}

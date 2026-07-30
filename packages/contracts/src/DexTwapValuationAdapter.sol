// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FullMath } from "./lib/FullMath.sol";
import { TickMath } from "./lib/TickMath.sol";

interface IUniswapV3PoolTwap {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (
            int56[] memory tickCumulatives,
            uint160[] memory secondsPerLiquidityCumulativeX128s
        );
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function observations(uint256 index)
        external
        view
        returns (
            uint32 blockTimestamp,
            int56 tickCumulative,
            uint160 secondsPerLiquidityCumulativeX128,
            bool initialized
        );
}

contract DexTwapValuationAdapter is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    error InvalidConfiguration();
    error InvalidRoute();

    bytes32 public constant CONFIGURATOR_ROLE = keccak256("CONFIGURATOR_ROLE");
    uint32 public constant DEFAULT_TWAP_WINDOW = 30 minutes;
    uint32 public constant MAXIMUM_OBSERVATION_AGE = 1 hours;

    struct TwapRoute {
        address directPool;
        address bridgePool;
        uint128 minimumDirectLiquidity;
        uint128 minimumBridgeLiquidity;
        uint16 minimumObservationCardinality;
        uint32 maximumObservationAge;
        bool enabled;
    }

    address public reserve;
    address public weth;
    uint32 public twapWindow;
    mapping(address => TwapRoute) public routes;

    event TwapRouteConfigured(
        address indexed asset,
        address indexed directPool,
        address indexed bridgePool,
        uint128 minimumDirectLiquidity,
        uint128 minimumBridgeLiquidity
    );
    event MaximumObservationAgeUpdated(address indexed asset, uint32 maximumObservationAge);

    function initialize(address admin, address reserve_, address weth_, uint32 twapWindow_)
        external
        initializer
    {
        if (admin == address(0) || reserve_ == address(0) || weth_ == address(0)) {
            revert InvalidConfiguration();
        }
        __UUPSUpgradeable_init();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIGURATOR_ROLE, admin);
        reserve = reserve_;
        weth = weth_;
        twapWindow = twapWindow_ == 0 ? DEFAULT_TWAP_WINDOW : twapWindow_;
    }

    function configureRoute(address asset, TwapRoute calldata route)
        external
        onlyRole(CONFIGURATOR_ROLE)
    {
        if (asset == address(0) || asset == reserve || !route.enabled) {
            revert InvalidConfiguration();
        }
        if (route.directPool == address(0)) revert InvalidConfiguration();
        if (route.bridgePool == address(0)) {
            _validatePool(route.directPool, asset, reserve);
        } else {
            _validatePool(route.directPool, asset, weth);
            _validatePool(route.bridgePool, weth, reserve);
        }
        routes[asset] = route;
        emit TwapRouteConfigured(
            asset,
            route.directPool,
            route.bridgePool,
            route.minimumDirectLiquidity,
            route.minimumBridgeLiquidity
        );
    }

    function setMaximumObservationAge(address asset, uint32 maximumObservationAge)
        external
        onlyRole(CONFIGURATOR_ROLE)
    {
        TwapRoute storage route = routes[asset];
        if (
            !route.enabled || maximumObservationAge == 0
                || maximumObservationAge > MAXIMUM_OBSERVATION_AGE
        ) {
            revert InvalidConfiguration();
        }
        route.maximumObservationAge = maximumObservationAge;
        emit MaximumObservationAgeUpdated(asset, maximumObservationAge);
    }

    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid)
    {
        if (token == reserve) return (1e18, block.timestamp, true);
        TwapRoute memory route = routes[token];
        if (!route.enabled) return (0, 0, false);
        (uint256 firstQuote, uint256 firstUpdated, bool firstValid) = _poolQuote(
            route.directPool,
            token,
            route.bridgePool == address(0) ? reserve : weth,
            _unit(token),
            route.minimumDirectLiquidity,
            route.minimumObservationCardinality,
            route.maximumObservationAge
        );
        if (!firstValid) return (0, firstUpdated, false);
        if (route.bridgePool == address(0)) {
            return (_reserveToWad(firstQuote), firstUpdated, true);
        }
        (uint256 reserveQuote, uint256 secondUpdated, bool secondValid) = _poolQuote(
            route.bridgePool,
            weth,
            reserve,
            firstQuote,
            route.minimumBridgeLiquidity,
            route.minimumObservationCardinality,
            route.maximumObservationAge
        );
        updatedAt = firstUpdated < secondUpdated ? firstUpdated : secondUpdated;
        return secondValid ? (_reserveToWad(reserveQuote), updatedAt, true) : (0, updatedAt, false);
    }

    function quoteAmount(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, bool valid)
    {
        if (tokenIn == tokenOut) return (amountIn, true);
        (uint256 inPrice,, bool inValid) = this.quoteStatus(tokenIn);
        (uint256 outPrice,, bool outValid) = this.quoteStatus(tokenOut);
        if (!inValid || !outValid || outPrice == 0) return (0, false);
        uint256 inUsd = FullMath.mulDiv(amountIn, inPrice, _unit(tokenIn));
        amountOut = FullMath.mulDiv(inUsd, _unit(tokenOut), outPrice);
        valid = amountOut > 0;
    }

    function _poolQuote(
        address poolAddress,
        address baseToken,
        address quoteToken,
        uint256 baseAmount,
        uint128 minimumLiquidity,
        uint16 minimumCardinality,
        uint32 maximumObservationAge
    ) private view returns (uint256 quoteAmount, uint256 updatedAt, bool valid) {
        IUniswapV3PoolTwap pool = IUniswapV3PoolTwap(poolAddress);
        if (pool.liquidity() < minimumLiquidity) return (0, 0, false);
        (,, uint16 index, uint16 cardinality,,,,) = _slot0(pool);
        if (cardinality < minimumCardinality) return (0, 0, false);
        (uint32 observationTime,,, bool initialized) = pool.observations(index);
        updatedAt = uint256(observationTime);
        if (
            !initialized || updatedAt > block.timestamp
                || block.timestamp - updatedAt > maximumObservationAge
        ) return (0, updatedAt, false);
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        (int56[] memory cumulatives,) = pool.observe(secondsAgos);
        int56 delta = cumulatives[1] - cumulatives[0];
        int24 meanTick = int24(delta / int56(uint56(twapWindow)));
        if (delta < 0 && delta % int56(uint56(twapWindow)) != 0) meanTick--;
        quoteAmount = _quoteAtTick(meanTick, uint128(baseAmount), baseToken, quoteToken);
        valid = quoteAmount > 0;
    }

    function _slot0(IUniswapV3PoolTwap pool)
        private
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool, bool)
    {
        try pool.slot0() returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        ) {
            return (
                sqrtPriceX96,
                tick,
                observationIndex,
                observationCardinality,
                observationCardinalityNext,
                feeProtocol,
                unlocked,
                true
            );
        } catch {
            return (0, 0, 0, 0, 0, 0, false, false);
        }
    }

    function _quoteAtTick(int24 tick, uint128 baseAmount, address baseToken, address quoteToken)
        private
        pure
        returns (uint256 quoteAmount)
    {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }

    function _validatePool(address poolAddress, address tokenA, address tokenB) private view {
        IUniswapV3PoolTwap pool = IUniswapV3PoolTwap(poolAddress);
        address token0 = pool.token0();
        address token1 = pool.token1();
        if (!((token0 == tokenA && token1 == tokenB) || (token0 == tokenB && token1 == tokenA))) {
            revert InvalidRoute();
        }
    }

    function _unit(address token) private view returns (uint256) {
        uint8 decimals = IERC20Metadata(token).decimals();
        if (decimals > 36) revert InvalidConfiguration();
        return 10 ** decimals;
    }

    function _reserveToWad(uint256 amount) private view returns (uint256) {
        return FullMath.mulDiv(amount, 1e18, _unit(reserve));
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}

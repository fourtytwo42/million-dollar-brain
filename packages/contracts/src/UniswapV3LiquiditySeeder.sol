// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV3PoolSeed {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function initialize(uint160 sqrtPriceX96) external;
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
    function mint(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);
}

/// @notice Test-environment helper for seeding official Uniswap V3 pools.
contract UniswapV3LiquiditySeeder {
    using SafeERC20 for IERC20;

    error SeedInProgress();
    error InvalidCallback();

    address private expectedPool;
    address private expectedPayer;

    function initializePool(address pool, uint160 sqrtPriceX96, uint16 cardinality) external {
        IUniswapV3PoolSeed(pool).initialize(sqrtPriceX96);
        IUniswapV3PoolSeed(pool).increaseObservationCardinalityNext(cardinality);
    }

    function seed(
        address pool,
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) external returns (uint256 amount0, uint256 amount1) {
        if (expectedPool != address(0)) revert SeedInProgress();
        expectedPool = pool;
        expectedPayer = msg.sender;
        (amount0, amount1) =
            IUniswapV3PoolSeed(pool).mint(recipient, tickLower, tickUpper, liquidity, bytes(""));
        expectedPool = address(0);
        expectedPayer = address(0);
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata)
        external
    {
        if (msg.sender != expectedPool || expectedPayer == address(0)) revert InvalidCallback();
        IUniswapV3PoolSeed pool = IUniswapV3PoolSeed(msg.sender);
        if (amount0Owed > 0) {
            IERC20(pool.token0()).safeTransferFrom(expectedPayer, msg.sender, amount0Owed);
        }
        if (amount1Owed > 0) {
            IERC20(pool.token1()).safeTransferFrom(expectedPayer, msg.sender, amount1Owed);
        }
    }
}

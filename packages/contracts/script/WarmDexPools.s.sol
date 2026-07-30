// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ISwapRouter02 } from "../src/UniswapExecutionAdapter.sol";

contract WarmDexPools is Script {
    function run() external {
        address routerAddress = vm.envAddress("MDB_DEX_ROUTER");
        address reserve = vm.envAddress("MDB_RESERVE");
        address recipient = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address[] memory assets = vm.envAddress("MDB_DEX_ASSETS", ",");
        uint256 amountIn = vm.envOr("MDB_DEX_KEEPALIVE_AMOUNT", uint256(1e14));
        vm.startBroadcast();
        for (uint256 i; i < assets.length; ++i) {
            IERC20(reserve).approve(routerAddress, amountIn);
            uint256 received = ISwapRouter02(routerAddress)
                .exactInputSingle(
                    ISwapRouter02.ExactInputSingleParams({
                    tokenIn: reserve,
                    tokenOut: assets[i],
                    fee: 3000,
                    recipient: recipient,
                    amountIn: amountIn,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
                );
            IERC20(assets[i]).approve(routerAddress, received);
            ISwapRouter02(routerAddress)
                .exactInputSingle(
                    ISwapRouter02.ExactInputSingleParams({
                    tokenIn: assets[i],
                    tokenOut: reserve,
                    fee: 3000,
                    recipient: recipient,
                    amountIn: received,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
                );
        }
        vm.stopBroadcast();
    }
}

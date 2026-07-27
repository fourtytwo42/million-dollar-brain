// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Deterministic 18-decimal local-devnet router. Prices are USDG per token, scaled by 1e18.
contract MockRouter is Ownable {
    error InvalidToken();
    error InvalidAmount();

    IERC20 public immutable usdg;
    mapping(address => uint256) public priceWad;
    mapping(address => uint256) public priceUpdatedAt;

    event PriceUpdated(address indexed token, uint256 priceWad);
    event Swapped(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(address usdg_, address owner_) Ownable(owner_) {
        usdg = IERC20(usdg_);
    }

    function setPrice(address token, uint256 newPriceWad) external onlyOwner {
        if (token == address(0) || newPriceWad == 0) revert InvalidToken();
        priceWad[token] = newPriceWad;
        priceUpdatedAt[token] = block.timestamp;
        emit PriceUpdated(token, newPriceWad);
    }

    function quoteStatus(address token)
        external
        view
        returns (uint256 price, uint256 updatedAt, bool valid)
    {
        price = priceWad[token];
        updatedAt = priceUpdatedAt[token];
        valid = price > 0;
    }

    function quoteUsd(address token, uint256 tokenAmount) public view returns (uint256) {
        uint256 price = priceWad[token];
        if (price == 0) revert InvalidToken();
        return (tokenAmount * price) / 1e18;
    }

    function buy(address tokenOut, uint256 usdgIn, uint256 minimumTokenOut)
        external
        returns (uint256 tokenOutAmount)
    {
        if (usdgIn == 0) revert InvalidAmount();
        uint256 price = priceWad[tokenOut];
        if (price == 0) revert InvalidToken();
        tokenOutAmount = (usdgIn * 1e18) / price;
        if (tokenOutAmount < minimumTokenOut) revert InvalidAmount();
        require(usdg.transferFrom(msg.sender, address(this), usdgIn), "USDG transfer failed");
        require(IERC20(tokenOut).transfer(msg.sender, tokenOutAmount), "asset transfer failed");
        emit Swapped(msg.sender, address(usdg), tokenOut, usdgIn, tokenOutAmount);
    }

    function sell(address tokenIn, uint256 tokenInAmount, uint256 minimumUsdgOut)
        external
        returns (uint256 usdgOut)
    {
        if (tokenInAmount == 0) revert InvalidAmount();
        usdgOut = quoteUsd(tokenIn, tokenInAmount);
        if (usdgOut < minimumUsdgOut) revert InvalidAmount();
        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), tokenInAmount),
            "asset transfer failed"
        );
        require(usdg.transfer(msg.sender, usdgOut), "USDG transfer failed");
        emit Swapped(msg.sender, tokenIn, address(usdg), tokenInAmount, usdgOut);
    }
}

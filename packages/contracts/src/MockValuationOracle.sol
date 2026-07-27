// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Local-devnet valuation adapter with controllable validity and staleness.
contract MockValuationOracle is Ownable {
    struct Price {
        uint256 priceWad;
        uint256 updatedAt;
        bool valid;
    }

    mapping(address => Price) public prices;
    bool public automaticFreshness = true;

    event PriceUpdated(address indexed token, uint256 priceWad, uint256 updatedAt, bool valid);
    event AutomaticFreshnessUpdated(bool enabled);

    constructor(address owner_) Ownable(owner_) { }

    function setPrice(address token, uint256 priceWad) external onlyOwner {
        _setPrice(token, priceWad, block.timestamp, true);
    }

    function setPriceStatus(address token, uint256 priceWad, uint256 updatedAt, bool valid)
        external
        onlyOwner
    {
        _setPrice(token, priceWad, updatedAt, valid);
    }

    function setAutomaticFreshness(bool enabled) external onlyOwner {
        automaticFreshness = enabled;
        emit AutomaticFreshnessUpdated(enabled);
    }

    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid)
    {
        Price memory price = prices[token];
        return (
            price.priceWad,
            automaticFreshness && price.valid ? block.timestamp : price.updatedAt,
            price.valid
        );
    }

    function quoteUsd(address token, uint256 tokenAmount) external view returns (uint256) {
        Price memory price = prices[token];
        require(price.valid && price.priceWad > 0, "invalid price");
        return (tokenAmount * price.priceWad) / 1e18;
    }

    function _setPrice(address token, uint256 priceWad, uint256 updatedAt, bool valid) private {
        require(token != address(0) && priceWad > 0, "invalid price");
        prices[token] = Price(priceWad, updatedAt, valid);
        emit PriceUpdated(token, priceWad, updatedAt, valid);
    }
}

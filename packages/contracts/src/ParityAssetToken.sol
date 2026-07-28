// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Clearly labelled testnet replica of production token identity and pause behavior.
contract ParityAssetToken is ERC20, Ownable {
    bytes32 public immutable uid;
    uint256 public uiMultiplier;
    uint256 public newUIMultiplier;
    uint256 public effectiveAt;
    bool public oraclePaused;

    event MultiplierTransitionScheduled(uint256 current, uint256 next, uint256 effectiveAt);
    event OraclePauseChanged(bool paused);

    constructor(string memory name_, string memory symbol_, bytes32 uid_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        require(bytes(name_).length > 0 && uid_ != bytes32(0), "invalid identity");
        uid = uid_;
        uiMultiplier = 1e18;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function scheduleMultiplier(uint256 nextMultiplier, uint256 transitionAt) external onlyOwner {
        require(nextMultiplier > 0 && transitionAt > block.timestamp, "invalid transition");
        newUIMultiplier = nextMultiplier;
        effectiveAt = transitionAt;
        emit MultiplierTransitionScheduled(uiMultiplier, nextMultiplier, transitionAt);
    }

    function applyMultiplier() external {
        require(effectiveAt != 0 && block.timestamp >= effectiveAt, "not effective");
        uiMultiplier = newUIMultiplier;
        newUIMultiplier = 0;
        effectiveAt = 0;
    }

    function setOraclePaused(bool paused) external onlyOwner {
        oraclePaused = paused;
        emit OraclePauseChanged(paused);
    }
}

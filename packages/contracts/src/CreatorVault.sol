// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CreatorVault is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    IERC20 public usdg;

    event Withdrawn(address indexed recipient, uint256 amount);

    function initialize(address admin, address usdg_) external initializer {
        require(admin != address(0) && usdg_ != address(0), "zero address");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        usdg = IERC20(usdg_);
    }

    function withdraw(address recipient, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "recipient");
        require(usdg.transfer(recipient, amount), "withdraw failed");
        emit Withdrawn(recipient, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

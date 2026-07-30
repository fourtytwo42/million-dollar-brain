// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { BasketVault } from "../src/BasketVault.sol";
import { DexTwapValuationAdapter } from "../src/DexTwapValuationAdapter.sol";
import { UniswapExecutionAdapter } from "../src/UniswapExecutionAdapter.sol";
import { UniswapV3LiquiditySeeder } from "../src/UniswapV3LiquiditySeeder.sol";
import { FullMath } from "../src/lib/FullMath.sol";

interface IFactoryDeploy {
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
}

interface IMintableAsset {
    function mint(address to, uint256 amount) external;
}

interface IPriceStatus {
    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid);
}

contract DeployDexV5 is Script {
    uint24 internal constant FEE = 3000;
    uint128 internal constant SEED_LIQUIDITY = 1e24;
    uint256 internal constant Q192 = 1 << 192;

    struct PoolRecord {
        address asset;
        address pool;
    }

    function run() external {
        address admin = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address basketAddress = vm.envAddress("MDB_BASKET");
        address reserve = vm.envAddress("MDB_RESERVE");
        address weth = vm.envAddress("MDB_WETH");
        address[] memory assets = vm.envAddress("MDB_DEX_ASSETS", ",");
        string memory output = vm.envString("MDB_DEX_DEPLOYMENT_OUTPUT");
        BasketVault existingBasket = BasketVault(basketAddress);
        address circuitBreaker = vm.envAddress("MDB_CIRCUIT_BREAKER");

        vm.startBroadcast();
        address factory = _deployVendor("UniswapV3Factory.json", bytes(""));
        address quoter = _deployVendor("QuoterV2.json", abi.encode(factory, weth));
        address router =
            _deployVendor("SwapRouter02.json", abi.encode(address(0), factory, address(0), weth));
        UniswapV3LiquiditySeeder seeder = new UniswapV3LiquiditySeeder();
        PoolRecord[] memory pools = new PoolRecord[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            (uint256 price,, bool valid) = IPriceStatus(circuitBreaker).quoteStatus(asset);
            require(valid && price > 0, "asset valuation unavailable");
            address pool = IFactoryDeploy(factory).createPool(asset, reserve, FEE);
            seeder.initializePool(pool, _sqrtPrice(asset, reserve, price), 64);
            IMintableAsset(asset).mint(admin, 1e29);
            IMintableAsset(reserve).mint(admin, 1e29);
            IERC20(asset).approve(address(seeder), type(uint256).max);
            IERC20(reserve).approve(address(seeder), type(uint256).max);
            seeder.seed(pool, admin, -887220, 887220, SEED_LIQUIDITY);
            IERC20(asset).approve(address(seeder), 0);
            IERC20(reserve).approve(address(seeder), 0);
            pools[i] = PoolRecord({ asset: asset, pool: pool });
        }

        DexTwapValuationAdapter valuationImplementation = new DexTwapValuationAdapter();
        DexTwapValuationAdapter valuation = DexTwapValuationAdapter(
            address(
                new ERC1967Proxy(
                    address(valuationImplementation),
                    abi.encodeCall(
                        DexTwapValuationAdapter.initialize,
                        (admin, reserve, weth, uint32(30 minutes))
                    )
                )
            )
        );
        for (uint256 i; i < pools.length; ++i) {
            valuation.configureRoute(
                pools[i].asset,
                DexTwapValuationAdapter.TwapRoute({
                    directPool: pools[i].pool,
                    bridgePool: address(0),
                    minimumDirectLiquidity: SEED_LIQUIDITY / 2,
                    minimumBridgeLiquidity: 0,
                    minimumObservationCardinality: 2,
                    maximumObservationAge: 15 minutes,
                    enabled: true
                })
            );
        }

        UniswapExecutionAdapter executionImplementation = new UniswapExecutionAdapter();
        UniswapExecutionAdapter execution = UniswapExecutionAdapter(
            address(
                new ERC1967Proxy(
                    address(executionImplementation),
                    abi.encodeCall(
                        UniswapExecutionAdapter.initialize,
                        (
                            admin,
                            basketAddress,
                            reserve,
                            weth,
                            factory,
                            router,
                            address(valuation),
                            circuitBreaker,
                            uint32(2 minutes)
                        )
                    )
                )
            )
        );
        execution.setFeeTier(FEE, true);
        for (uint256 i; i < pools.length; ++i) {
            execution.setPool(pools[i].pool, true);
        }

        BasketVault basketImplementation = new BasketVault();
        if (existingBasket.dexExecutionEnabled()) {
            existingBasket.upgradeToAndCall(address(basketImplementation), bytes(""));
            existingBasket.setDexAdapters(address(valuation), address(execution));
        } else {
            existingBasket.upgradeToAndCall(
                address(basketImplementation),
                abi.encodeCall(BasketVault.reinitializeV5, (address(valuation), address(execution)))
            );
        }
        existingBasket.setDexPriceAge(15 minutes);
        vm.stopBroadcast();

        string memory root = "dex";
        vm.serializeUint(root, "schemaVersion", 4);
        vm.serializeAddress(root, "factory", factory);
        vm.serializeAddress(root, "router", router);
        vm.serializeAddress(root, "quoter", quoter);
        vm.serializeAddress(root, "weth", weth);
        vm.serializeAddress(root, "liquiditySeeder", address(seeder));
        vm.serializeAddress(root, "valuationImplementation", address(valuationImplementation));
        vm.serializeAddress(root, "valuation", address(valuation));
        vm.serializeAddress(root, "executionImplementation", address(executionImplementation));
        vm.serializeAddress(root, "execution", address(execution));
        vm.serializeAddress(root, "basketImplementation", address(basketImplementation));
        address[] memory poolAddresses = new address[](pools.length);
        address[] memory poolAssets = new address[](pools.length);
        for (uint256 i; i < pools.length; ++i) {
            poolAddresses[i] = pools[i].pool;
            poolAssets[i] = pools[i].asset;
        }
        vm.serializeAddress(root, "poolAssets", poolAssets);
        string memory json = vm.serializeAddress(root, "pools", poolAddresses);
        vm.writeJson(json, output);
    }

    function _deployVendor(string memory artifact, bytes memory constructorArguments)
        private
        returns (address deployed)
    {
        string memory path = string.concat(vm.projectRoot(), "/vendor/uniswap-v3/", artifact);
        bytes memory creationCode = vm.parseJsonBytes(vm.readFile(path), ".bytecode");
        bytes memory initCode = bytes.concat(creationCode, constructorArguments);
        assembly ("memory-safe") {
            deployed := create(0, add(initCode, 0x20), mload(initCode))
        }
        require(deployed != address(0), "vendor deployment failed");
    }

    function _sqrtPrice(address asset, address reserve, uint256 priceWad)
        private
        view
        returns (uint160)
    {
        require(
            IERC20Metadata(asset).decimals() == IERC20Metadata(reserve).decimals(),
            "test replicas require matching decimals"
        );
        uint256 ratioX192 = asset < reserve
            ? FullMath.mulDiv(priceWad, Q192, 1e18)
            : FullMath.mulDiv(1e18, Q192, priceWad);
        uint256 result = _sqrt(ratioX192);
        require(result <= type(uint160).max, "sqrt price overflow");
        return uint160(result);
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        result = value;
        uint256 candidate = (value + 1) / 2;
        while (candidate < result) {
            result = candidate;
            candidate = (value / candidate + candidate) / 2;
        }
    }
}

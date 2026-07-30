// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {DexTwapValuationAdapter} from "../src/DexTwapValuationAdapter.sol";
import {MockToken} from "../src/MockToken.sol";
import {ParityAssetToken} from "../src/ParityAssetToken.sol";
import {UniswapExecutionAdapter} from "../src/UniswapExecutionAdapter.sol";
import {UniswapV3LiquiditySeeder} from "../src/UniswapV3LiquiditySeeder.sol";
import {FullMath} from "../src/lib/FullMath.sol";

interface ICapacityFactory {
    function createPool(address tokenA, address tokenB, uint24 fee)
        external
        returns (address pool);
}

interface ICapacityMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Deploys inactive production-interface candidates on devnet/testnet.
/// @dev Activation remains impossible until the separate 48-hour qualifier
/// records valid V3 evidence.
contract DeployCapacityCandidates is Script {
    uint24 private constant FEE = 3_000;
    uint128 private constant SEED_LIQUIDITY = 1e24;
    uint256 private constant Q192 = 1 << 192;

    struct Candidate {
        string name;
        string symbol;
        bytes32 uid;
        uint32 id;
        AssetRegistry.AssetKind kind;
        address token;
        address pool;
    }

    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "devnet/testnet only");
        require(vm.envBool("MDB_CAPACITY_CANDIDATE_DEPLOY"), "candidate flag required");

        address admin = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address reserve = vm.envAddress("MDB_RESERVE");
        address factory = vm.envAddress("MDB_DEX_FACTORY");
        AssetRegistry registry = AssetRegistry(vm.envAddress("MDB_REGISTRY"));
        DexTwapValuationAdapter valuation =
            DexTwapValuationAdapter(vm.envAddress("MDB_DEX_VALUATION_ADAPTER"));
        UniswapExecutionAdapter execution =
            UniswapExecutionAdapter(vm.envAddress("MDB_DEX_EXECUTION_ADAPTER"));
        uint256[] memory prices = vm.envUint("MDB_CAPACITY_CANDIDATE_PRICES_WAD", ",");
        string memory output = vm.envString("MDB_CAPACITY_CANDIDATE_OUTPUT");
        require(prices.length == 3, "three candidate prices required");
        require(registry.qualificationV3Enabled(), "capacity V3 required");

        vm.startBroadcast();
        Candidate[] memory candidates = new Candidate[](3);
        candidates[0] = _stock("GME", "GME", 13, admin);
        candidates[1] = _stock("SPCX", "SPCX", 14, admin);
        MockToken virtualToken =
            new MockToken("Test Replica Virtuals Protocol", "VIRTUAL", 18, admin);
        candidates[2] = Candidate({
            name: "Test Replica Virtuals Protocol",
            symbol: "VIRTUAL",
            uid: bytes32(0),
            id: 15,
            kind: AssetRegistry.AssetKind.CRYPTO,
            token: address(virtualToken),
            pool: address(0)
        });

        UniswapV3LiquiditySeeder seeder = new UniswapV3LiquiditySeeder();
        for (uint256 i; i < candidates.length; ++i) {
            Candidate memory candidate = candidates[i];
            candidate.pool =
                ICapacityFactory(factory).createPool(candidate.token, reserve, FEE);
            seeder.initializePool(
                candidate.pool, _sqrtPrice(candidate.token, reserve, prices[i]), 64
            );
            ICapacityMintable(candidate.token).mint(admin, 1e29);
            ICapacityMintable(reserve).mint(admin, 1e29);
            IERC20(candidate.token).approve(address(seeder), type(uint256).max);
            IERC20(reserve).approve(address(seeder), type(uint256).max);
            seeder.seed(candidate.pool, admin, -887220, 887220, SEED_LIQUIDITY);
            IERC20(candidate.token).approve(address(seeder), 0);
            IERC20(reserve).approve(address(seeder), 0);

            valuation.configureRoute(
                candidate.token,
                DexTwapValuationAdapter.TwapRoute({
                    directPool: candidate.pool,
                    bridgePool: address(0),
                    minimumDirectLiquidity: SEED_LIQUIDITY / 2,
                    minimumBridgeLiquidity: 0,
                    minimumObservationCardinality: 2,
                    maximumObservationAge: 15 minutes,
                    enabled: true
                })
            );
            valuation.configureSafety(
                candidate.token,
                DexTwapValuationAdapter.DexSafetyConfig({
                    minimumDirectHarmonicLiquidity: SEED_LIQUIDITY / 2,
                    minimumBridgeHarmonicLiquidity: 0,
                    maximumSpotToShortDeviationBps: 300,
                    maximumShortToLongDeviationBps: 500,
                    enabled: true
                })
            );
            execution.setPool(candidate.pool, true);

            registry.registerAsset(
                AssetRegistry.AssetRecord({
                    token: candidate.token,
                    robinhoodUid: candidate.uid,
                    kind: candidate.kind,
                    riskClass: AssetRegistry.RiskClass.HIGH_VOLATILITY,
                    valuationAdapter: address(valuation),
                    executionAdapter: address(execution),
                    circulatingSupplyAdapter: address(0),
                    maximumWeightBps: 2_000,
                    registered: false,
                    active: false
                })
            );
            bytes32[] memory tags = new bytes32[](3);
            tags[0] = candidate.kind == AssetRegistry.AssetKind.CRYPTO
                ? bytes32("crypto")
                : bytes32("stock");
            tags[1] = bytes32("high_volatility");
            tags[2] = keccak256(bytes(candidate.symbol));
            registry.configureAssetIdentity(candidate.token, candidate.id, tags);
            candidates[i] = candidate;
        }
        address[] memory identityTestTokens = new address[](0);
        address[] memory identityTestPools = new address[](0);
        if (block.chainid == 31_337) {
            identityTestTokens = new address[](3);
            identityTestPools = new address[](3);
            identityTestTokens[0] =
                address(new MockToken("Unapproved WBTC Lookalike A", "WBTC", 18, admin));
            identityTestTokens[1] =
                address(new MockToken("Unapproved WBTC Lookalike B", "WBTC", 18, admin));
            identityTestTokens[2] =
                address(new MockToken("Unapproved Synthetic Dollar", "USDe", 18, admin));
            for (uint256 i; i < identityTestTokens.length; ++i) {
                uint256 testPrice = i == 2 ? 1e18 : 60_000e18;
                identityTestPools[i] = _seedUnregisteredScenario(
                    identityTestTokens[i],
                    reserve,
                    factory,
                    seeder,
                    admin,
                    testPrice
                );
                (AssetRegistry.AssetRecord memory record,) =
                    registry.asset(identityTestTokens[i]);
                require(!record.registered, "identity test asset admitted");
            }
        }
        vm.stopBroadcast();

        string memory root = "capacityCandidates";
        vm.serializeUint(root, "schemaVersion", 1);
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "liquiditySeeder", address(seeder));
        address[] memory tokens = new address[](candidates.length);
        address[] memory pools = new address[](candidates.length);
        uint256[] memory ids = new uint256[](candidates.length);
        for (uint256 i; i < candidates.length; ++i) {
            tokens[i] = candidates[i].token;
            pools[i] = candidates[i].pool;
            ids[i] = candidates[i].id;
        }
        vm.serializeAddress(root, "tokens", tokens);
        vm.serializeAddress(root, "pools", pools);
        vm.serializeAddress(root, "identityTestTokens", identityTestTokens);
        vm.serializeAddress(root, "identityTestPools", identityTestPools);
        string memory json = vm.serializeUint(root, "assetIds", ids);
        vm.writeJson(json, output);
    }

    function _stock(string memory name, string memory symbol, uint32 id, address admin)
        private
        returns (Candidate memory)
    {
        bytes32 uid = keccak256(abi.encodePacked("42-braincells-test-replica:", symbol));
        ParityAssetToken token =
            new ParityAssetToken(string.concat("Test Replica ", name), symbol, uid, admin);
        return Candidate({
            name: name,
            symbol: symbol,
            uid: uid,
            id: id,
            kind: AssetRegistry.AssetKind.STOCK,
            token: address(token),
            pool: address(0)
        });
    }

    function _seedUnregisteredScenario(
        address token,
        address reserve,
        address factory,
        UniswapV3LiquiditySeeder seeder,
        address admin,
        uint256 priceWad
    ) private returns (address pool) {
        pool = ICapacityFactory(factory).createPool(token, reserve, FEE);
        seeder.initializePool(pool, _sqrtPrice(token, reserve, priceWad), 64);
        ICapacityMintable(token).mint(admin, 1e29);
        ICapacityMintable(reserve).mint(admin, 1e29);
        IERC20(token).approve(address(seeder), type(uint256).max);
        IERC20(reserve).approve(address(seeder), type(uint256).max);
        seeder.seed(pool, admin, -887220, 887220, SEED_LIQUIDITY);
        IERC20(token).approve(address(seeder), 0);
        IERC20(reserve).approve(address(seeder), 0);
    }

    function _sqrtPrice(address asset, address reserve, uint256 priceWad)
        private
        pure
        returns (uint160)
    {
        uint256 ratioX192 = asset < reserve
            ? FullMath.mulDiv(priceWad, Q192, 1e18)
            : FullMath.mulDiv(1e18, Q192, priceWad);
        uint256 sqrtRatio = _sqrt(ratioX192);
        require(sqrtRatio > 0 && sqrtRatio <= type(uint160).max, "invalid price");
        return uint160(sqrtRatio);
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        result = 1 << ((255 - _clz(value)) >> 1);
        for (uint256 i; i < 7; ++i) result = (result + value / result) >> 1;
        uint256 roundedDown = value / result;
        return result < roundedDown ? result : roundedDown;
    }

    function _clz(uint256 value) private pure returns (uint256 count) {
        while (value < (1 << 255)) {
            value <<= 1;
            ++count;
        }
    }
}

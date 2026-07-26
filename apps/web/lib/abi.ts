export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const basketAbi = [
  { type: "function", name: "nav", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "grossAmount", type: "uint256" }, { name: "minimumShares", type: "uint256" }, { name: "deadline", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "redeem", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "minimumNet", type: "uint256" }, { name: "deadline", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rebalance", stateMutability: "nonpayable", inputs: [{ name: "targetAssets", type: "address[]" }, { name: "weights", type: "uint16[]" }, { name: "cycleHash", type: "bytes32" }], outputs: [] },
] as const;

export const brainAbi = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "pieceId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "currentPrice", stateMutability: "view", inputs: [{ name: "pieceId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "selectedPreset", stateMutability: "view", inputs: [{ name: "pieceId", type: "uint256" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "immutableWeight", stateMutability: "view", inputs: [{ name: "pieceId", type: "uint256" }], outputs: [{ type: "uint16" }] },
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "pieceId", type: "uint256" }, { name: "maximumPrice", type: "uint256" }, { name: "deadline", type: "uint256" }], outputs: [] },
  { type: "function", name: "setPreset", stateMutability: "nonpayable", inputs: [{ name: "pieceId", type: "uint256" }, { name: "preset", type: "uint8" }], outputs: [] },
] as const;

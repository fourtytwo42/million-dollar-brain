export function redeemPreviewShares(
  requestedRedeem: bigint | undefined,
  walletShares: bigint,
  hasAccount: boolean,
) {
  if (requestedRedeem == null) return walletShares / 2n;
  if (!hasAccount) return requestedRedeem;
  return requestedRedeem > walletShares ? walletShares : requestedRedeem;
}

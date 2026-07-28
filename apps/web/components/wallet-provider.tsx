"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useState, type ReactNode } from "react";
import {
  RainbowKitProvider,
  getDefaultConfig,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defineChain, http } from "viem";
import { WagmiProvider } from "wagmi";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  "5a4c41c8c461ca59724069d740760a2f";

// RainbowKit's dedicated MetaMask SDK connector can leave its extension
// transport stuck after disconnecting and immediately reconnecting. Keep the
// MetaMask branding while using the same EIP-1193 injected-provider path that
// reliably reopens the installed extension.
const metaMaskInjectedWallet: typeof metaMaskWallet = (options) => {
  const branded = metaMaskWallet(options);
  const injected = injectedWallet();
  return {
    ...branded,
    createConnector: injected.createConnector,
    installed: injected.installed ?? branded.installed,
  };
};

const local = defineChain({
  id: 31337,
  name: "MillionDollar Brain Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://192.168.50.135:8545"] } },
  testnet: true,
});

const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

function makeConfig() {
  const appUrl =
    typeof window === "undefined"
      ? "http://192.168.50.135:3000"
      : window.location.origin;
  return getDefaultConfig({
    appName: "MillionDollar Brain",
    appDescription: "A community-steered autonomous basket.",
    appUrl,
    projectId,
    chains: [local, robinhoodTestnet],
    transports: {
      [local.id]: http(local.rpcUrls.default.http[0]),
      [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
    },
    multiInjectedProviderDiscovery: true,
    ssr: true,
    wallets: [
      {
        groupName: "Robinhood Wallet via WalletConnect",
        wallets: [walletConnectWallet],
      },
      {
        groupName: "Popular wallets",
        wallets: [
          metaMaskInjectedWallet,
          rabbyWallet,
          coinbaseWallet,
          rainbowWallet,
          trustWallet,
        ],
      },
      {
        groupName: "Hardware and multisig",
        wallets: [safeWallet, ledgerWallet],
      },
      { groupName: "Other EVM wallets", wallets: [injectedWallet] },
    ],
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [config] = useState(makeConfig);
  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#7d1f2d",
            accentColorForeground: "#fffaf1",
            borderRadius: "medium",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

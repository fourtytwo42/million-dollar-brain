import "./globals.css";
import { WalletProvider } from "@/components/wallet-provider";

export const metadata = {
  title: "42 Braincells",
  description:
    "The internet's last 42 braincells manage an on-chain portfolio.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

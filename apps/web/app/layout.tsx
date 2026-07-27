import "./globals.css";
import { WalletProvider } from "@/components/wallet-provider";

export const metadata = {
  title: "MillionDollar Brain",
  description:
    "A local-devnet autonomous basket directed by a constrained AI brain.",
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

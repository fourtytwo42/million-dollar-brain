import "./globals.css";

export const metadata = {
  title: "MillionDollar Brain",
  description: "A local-devnet autonomous basket directed by a constrained AI brain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

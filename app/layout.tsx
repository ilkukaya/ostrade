import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OSTRADE",
    template: "%s | OSTRADE",
  },
  description: "Private swing-trading research terminal for explainable setups, daily market review, backtesting and risk analysis.",
  applicationName: "OSTRADE",
};

const themeBootstrap = `
(() => {
  try {
    const stored = localStorage.getItem('ostrade-theme');
    const theme = stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'light';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = theme === 'dark' || (theme === 'system' && systemDark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

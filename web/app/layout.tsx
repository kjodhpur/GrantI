import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GPI — Grant Prospect Intelligence",
  description: "AI-assisted grant prospect intelligence that helps nonprofit fundraising teams prioritize funders, understand fit, and make evidence-backed decisions.",
  openGraph: {
    title: "GPI — Grant Prospect Intelligence",
    description: "Open the door to better-fit funding.",
    siteName: "GPI",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}

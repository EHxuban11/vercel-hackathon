import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Phone Jail",
  description:
    "Your webcam catches you with your phone. A disappointed parent voice shames you. Your team sees everything.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <Link href="/" className="font-bold text-lg tracking-tight">
            📵 Phone Jail
          </Link>
          <nav className="flex gap-5 text-sm text-zinc-400">
            <Link href="/focus" className="hover:text-white transition-colors">
              Focus
            </Link>
            <Link href="/shame" className="hover:text-white transition-colors">
              Wall of Shame
            </Link>
          </nav>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}

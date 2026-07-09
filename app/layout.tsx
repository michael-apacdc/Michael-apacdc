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
  title: "全球数据中心行业趋势与投资分析",
  description: "每日自动生成的数据中心行业趋势、竞争态势与投资分析报告",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b border-line bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
              <span className="font-mono text-[13px] font-medium tracking-tight text-foreground">
                DATA<span className="text-accent">CENTER</span>.ANALYSIS
              </span>
            </Link>
            <nav className="flex gap-6 font-mono text-[13px] text-muted">
              <Link href="/" className="transition-colors hover:text-accent">
                最新报告
              </Link>
              <Link href="/archive" className="transition-colors hover:text-accent">
                历史归档
              </Link>
              <Link href="/sea" className="transition-colors hover:text-accent">
                选址分析
              </Link>
              <Link href="/quant" className="transition-colors hover:text-accent">
                量化分析
              </Link>
              <Link href="/trend" className="transition-colors hover:text-accent">
                趋势研判
              </Link>
              <Link href="/portfolio" className="transition-colors hover:text-accent">
                我的持仓
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line px-4 py-6 text-center font-mono text-[11px] text-muted">
          全球数据中心行业趋势与投资分析 · 每日自动生成
        </footer>
      </body>
    </html>
  );
}

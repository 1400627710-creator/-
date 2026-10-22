import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "卡递 · 统一卡片工作台",
  description: "让档案与卡片共用一个私人项目，保留原文、字段与故事时间。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "雙方對帳 v1",
  description: "寄貨、Wise 轉帳與互抵結算工具",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

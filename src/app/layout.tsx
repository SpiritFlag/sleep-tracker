import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/access";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sleep Observatory · 수면 기록",
  description: "잠든 시간과 깨어난 시간, 나의 수면을 관찰하는 개인 기록실.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {clerkConfigured() ? (
          <ClerkProvider>{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}

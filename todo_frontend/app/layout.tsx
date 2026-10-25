import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "todos — Kichik qadamlar, katta natijalar",
  description:
    "Vazifalar, rejalar va kundalik yutuqlaringiz uchun qulay makon. Your thoughtful daily task manager.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

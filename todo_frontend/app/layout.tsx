import type { Metadata } from "next";
import { author, description, indexable, siteUrl, title } from "@/lib/seo";
import "./styles.css";
export const metadata: Metadata = {
  metadataBase: siteUrl || new URL('http://localhost:3000'),
  title: { default: title, template: '%s | todos' },
  description,
  applicationName: 'todos',
  authors: [author],
  creator: author.name,
  ...(siteUrl ? { alternates: { canonical: siteUrl.href } } : {}),
  robots: { index: indexable, follow: indexable },
  openGraph: { type: 'website', locale: 'uz_UZ', siteName: 'todos', title, description, ...(siteUrl ? { url: siteUrl.href } : {}) },
  twitter: { card: 'summary_large_image', title, description },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } : {} },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="uz" suppressHydrationWarning><head><meta name="darkreader-lock" /></head><body>{children}</body></html>;
}

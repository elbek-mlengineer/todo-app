import type { MetadataRoute } from 'next';
import { indexable, siteUrl } from '@/lib/seo';
export default function robots(): MetadataRoute.Robots {
  return indexable && siteUrl ? { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/login'] }, sitemap: new URL('/sitemap.xml', siteUrl).href } : { rules: { userAgent: '*', disallow: '/' } };
}

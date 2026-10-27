export const siteUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
if (siteUrl && (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password || siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash)) throw new Error('SITE_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
export const indexable = Boolean(siteUrl && process.env.SITE_INDEXABLE === 'true' && !['localhost', '127.0.0.1', '[::1]'].includes(siteUrl.hostname));
export const title = 'todos — Vazifalar va kundalik rejalar';
export const description = 'Kundalik vazifalaringizni rejalashtiring, muddat va muhimlikni belgilang. Google yoki Telegram orqali kiring va eslatmalar bilan rejalaringizni kuzatib boring.';
export const author = { name: 'Hamidullayev Elbek', url: 'https://github.com/elbek-mlengineer' };

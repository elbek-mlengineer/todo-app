// Bot login works locally; WEB_URL also controls the allowed browser origin.
import 'dotenv/config';
export const webUrl = (process.env.WEB_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const isProduction = process.env.NODE_ENV === 'production';
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction || webUrl.startsWith('https://'),
  path: '/',
};
export const sessionCookie = isProduction
  ? '__Host-todo_session'
  : 'todo_session';
export function paymentConfig() {
  const price = Number(process.env.PRO_PRICE_UZS);
  const days = Number(process.env.PRO_DURATION_DAYS || 30);
  const card = process.env.PAYMENT_CARD_NUMBER || '';
  const holder = process.env.PAYMENT_CARD_HOLDER || '';
  return {
    price,
    days,
    card,
    holder,
    enabled:
      /^\d{16}$/.test(card.replace(/\s/g, '')) &&
      !!holder &&
      Number.isInteger(price) &&
      price > 0 &&
      price < 2147483647 &&
      Number.isInteger(days) &&
      days > 0 &&
      days <= 3660,
  };
}
export const themes = [
  'light',
  'dark',
  'forest',
  'lavender',
  'sunset',
  'ocean',
];
export function isPro(user: { pro_until?: string | Date | null }) {
  return !!user.pro_until && new Date(user.pro_until).getTime() > Date.now();
}

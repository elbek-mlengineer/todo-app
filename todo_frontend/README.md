# todos frontend

Next.js App Router, TypeScript, Uzbek/English interface, responsive dashboard and Pro themes.

Full setup and Google/Telegram instructions: [project README](../README.md).

Run from this directory: `npm run dev` or `npm run build` and `npm start`. The backend must be reachable at `API_INTERNAL_URL`.

## SEO va production domen

Frontend metadata, Open Graph/Twitter PNG preview, WebApplication JSON-LD,
robots.txt va sitemap.xml ni yaratadi. Bosh sahifa server HTML ichida ilova
haqida ochiq tavsif beradi; shaxsiy vazifalar sitemapga kiritilmaydi.
`/login` mavjud bosh sahifaga redirect bo‘lib qoladi. `/api/*` javoblari
X-Robots-Tag: noindex, nofollow, nosnippet sarlavhasini qaytaradi.

Deploy qilishdan OLDIN frontend muhitida quyidagilarni belgilang:

```dotenv
SITE_URL=https://sizning-haqiqiy-domeningiz.uz
SITE_INDEXABLE=true
GOOGLE_SITE_VERIFICATION=search-console-bergan-kod
BING_SITE_VERIFICATION=bing-bergan-kod
```

Domenni haqiqiy domen bilan almashtiring. SITE_URL faqat origin bo‘lishi
kerak (ichki yo‘l, query yoki parolsiz). Preview/staging uchun
SITE_INDEXABLE=false qoldiring. Domen yo‘q yoki indekslash yoqilmagan bo‘lsa,
noindex va robots Disallow: / beriladi; sitemap bo‘sh qoladi. Sozlamalar
build vaqtida o‘qiladi: o‘zgartirgandan keyin qayta build va deploy qiling.

HTTPS, asosiy domen va www variantlari orasida 301/308 redirectni hostingda
sozlang. Google Search Console’da domen egaligini tasdiqlang va
https://HAQIQIY-DOMEN/sitemap.xml ni yuboring; Bing Webmaster Tools’da ham
shu ishni bajaring. Bu tashqi hisob amallari loyiha kodidan bajarilmaydi.
Search Console URL Inspection bilan bosh sahifani tekshiring. Rich Results
Test bilan JSON-LD ni tekshiring; boyitilgan natija chiqishi kafolatlanmaydi.
Mobil PageSpeed Insights orqali LCP, INP va CLS ni haqiqiy deployda o‘lchang.
JavaScript orqali til almashtirilishi alohida inglizcha URL yaratmaydi,
shuning uchun mavjud bo‘lmagan /en sahifasi uchun hreflang berilmagan.
Shaxsiy ma’lumotlar himoyasi autentifikatsiyaga tayanadi, robots.txt ga emas.

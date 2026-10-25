# todos

Next.js + NestJS + PostgreSQL asosidagi shaxsiy vazifalar ilovasi. Interfeys o‘zbek va ingliz tillarida. Mavjud `todo_frontend` va `todo_backend` papkalari saqlangan.

## Tayyor imkoniyatlar

- Google OAuth va Telegram bot kodi orqali ro‘yxatdan o‘tish/kirish. Birinchi kirishda hisob yaratiladi.
- Sozlamalarda ikkinchi provayderni ulash: ikkala usul bilan aynan bitta hisobga kirish.
- Vazifa yaratish, tahrirlash, o‘chirish va bajarilgan deb belgilash.
- Izoh, muddat, past/o‘rta/yuqori muhimlik va shaxsiy/ish/o‘qish/boshqa toifalari.
- Qidiruv, sana/holat/muhimlik/toifa filtrlari, saralash, sahifalash.
- Bugungi, kelgusi va bajarilgan vazifalar; haqiqiy ma’lumotlardan hisoblangan statistika.
- Muddatdan 15 daqiqa oldin va muddat kelganda ilovada hamda Telegram’da eslatma.
- Oddiy hisobda oq fon. Pro hisobda qora, o‘rmon, lavanda, quyosh botishi va okean fonlari.
- Kartaga o‘tkazma → chek yuklash → admin tekshiruvi → muddatli Pro.
- Cheklar PNG/JPG/WEBP/PDF, 5 MB gacha. Faqat egasi va admin yuklab oladi.
- Mobil ko‘rinish, modal oynalar, yuklanish/bo‘sh/xatolik holatlari.

## 1. Birinchi ishga tushirish (Windows)

Node.js 22 yoki yangiroq va Docker Desktop kerak. Docker Desktop’da Linux containers ishlashi lozim. Docker Desktop’ni oching va engine ishga tushishini kuting.

PowerShell’da:

```powershell
cd C:\Users\Acer\Desktop\todos
npm.cmd run install:all
npm.cmd run setup
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run dev
```

Brauzer: **http://localhost:3000**. `127.0.0.1` o‘rniga aynan `localhost` ishlating: cookie va OAuth manzillari mos bo‘lishi kerak. Backend `127.0.0.1:3001`, PostgreSQL `localhost:5433` da ishlaydi. Frontend `/api/*` so‘rovlarini backendga uzatadi.

`setup` tasodifiy lokal baza parolini yaratadi va mavjud `.env` fayllarni o‘zgartirmaydi. Shu kompyuterda lokal `.env` fayllari allaqachon yaratilgan. Berilgan administrator emaili lokal backend `.env` fayliga kiritilgan.

Docker ishga tushmasa: Docker Desktop holatini tekshiring. “Docker engine is not running” / named pipe xatosi kod xatosi emas. WSL2/virtualizatsiya talablari uchun [Docker Windows yo‘riqnomasi](https://docs.docker.com/desktop/setup/install/windows-install/)ga qarang. Docker ishlashi tasdiqlanmaguncha `db:start` bajarilmaydi.

Docker o‘rniga o‘zingizdagi PostgreSQL serveridan ham foydalanishingiz mumkin: alohida baza va foydalanuvchi yarating, `todo_backend/.env` ichida `DATABASE_URL` ni yozing, so‘ng `db:migrate` bajaring. TLS talab qiladigan hostingda `DATABASE_SSL=true`; server sertifikati tekshiriladi.

## 2. Google orqali kirish

Google Cloud Console’da quyidagilarni sozlang:

1. [Google Cloud Console](https://console.cloud.google.com/)da loyiha yarating yoki tanlang.
2. **Google Auth Platform** ichida Branding va Audience sozlamalarini to‘ldiring. Test rejimida o‘zingizning emailingizni test foydalanuvchi qilib qo‘shing.
3. **Clients → Create client → Web application** tanlang.
4. Authorized JavaScript origins: `http://localhost:3000`.
5. Authorized redirect URIs: **`http://localhost:3000/api/auth/google/callback`**.
6. Olingan qiymatlarni `todo_backend/.env` ga kiriting:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
ADMIN_EMAILS=your-google-email@example.com
```

`ADMIN_EMAILS` bir nechta manzil uchun vergul bilan ajratiladi. Google emailingiz tekshirilgan bo‘lishi kerak. Admin huquqi ushbu email orqali kirganda beriladi; Telegram orqali yaratilgan hisobga admin Google hisobini **Sozlamalar → Google → Ulash** orqali ulang. Backendni qayta ishga tushiring.

Google client secret serverda qoladi. `.env` faylini GitHub’ga yuklamang va kalitlarni chatga yuborish o‘rniga shu faylga o‘zingiz kiriting.

Rasmiy manba: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## 3. Telegram orqali kod bilan kirish va eslatma

Telegram login uchun BotFather Login Widget, Client ID, Client Secret, redirect URI yoki HTTPS tunnel kerak emas. Google OAuth sozlamalari o‘zgarishsiz qoladi.

1. [@BotFather](https://t.me/BotFather) orqali bot yarating yoki mavjud botdan foydalaning.
2. todo_backend/.env ichida quyidagilarni sozlang (tokenni chat yoki GitHub’ga yubormang):

    WEB_URL=http://localhost:3000
    TELEGRAM_BOT_TOKEN=your-bot-token
    TELEGRAM_BOT_USERNAME=your_bot_username
    TELEGRAM_POLLING_ENABLED=true

3. npm.cmd run db:migrate ni bajaring va serverni qayta ishga tushiring.
4. Saytda **Telegram orqali kirish → Telegram botni ochish** tugmalarini bosing. Botda **Start** bosing. Bot yuborgan 6 xonali kodni kirishni boshlagan brauzerdagi oynaga kiriting.
5. Google hisobingizga Telegram ulash uchun **Sozlamalar → Ulangan hisoblar → Telegram → Ulash** ni ishlating. Avvalgi OIDC Telegram hisoblari Telegram ID orqali o‘z egasiga qayta ulanadi; hisoblar ism yoki email o‘xshashligi asosida birlashtirilmaydi.

Kod kirish boshlangandan 5 daqiqa ichida, faqat bir marta ishlaydi. 5 noto‘g‘ri urinishdan keyin qayta boshlash kerak. Bir Telegram foydalanuvchisiga kod yuborish orasida kamida 30 soniya bo‘ladi. Botning oddiy /start buyrug‘i kod yaratmaydi: saytdan ochilgan maxsus havola kerak. Kodni faqat o‘zingiz kirishni boshlagan brauzerga kiriting.

Backend getUpdates long polling bilan ishlaydi va offsetni PostgreSQL’da saqlaydi. Bot uchun webhook yoki boshqa polling dasturi ishlamasligi kerak; mavjud webhookni ilova avtomatik o‘chirmaydi. Agar kod kelmasa, backend terminalidagi Telegram polling ogohlantirishini tekshiring. TELEGRAM_POLLING_ENABLED=false pollingni to‘xtatadi. Bot tokeni yoki username o‘zgarsa backendni qayta ishga tushiring. Eslatmalar shu bot orqali yuboriladi.

Mahalliy ishlab chiqishda http://localhost:3000 yetarli. Production’da sayt va cookie uchun HTTPS talab qilinadi.

Rasmiy manbalar: [Telegram deep links](https://core.telegram.org/bots/features#deep-linking), [getUpdates](https://core.telegram.org/bots/api#getupdates).

## 4. Pro narxi, karta va muddat

`todo_backend/.env`:

```dotenv
PAYMENT_CARD_NUMBER=your_16_digit_card_number
PAYMENT_CARD_HOLDER=NAME SURNAME
PRO_PRICE_UZS=15000
PRO_DURATION_DAYS=30
```

`15000` va `30` — misol, o‘zingiz tanlaysiz. Karta raqami, egasi va to‘g‘ri narx belgilanmaguncha to‘lov qabul qilish yopiq bo‘ladi. Karta raqami va egasi to‘lov sahifasida foydalanuvchiga ko‘rinadi. CVV, amal qilish muddati, SMS kod yoki bank paroli kerak emas.

Foydalanuvchi ko‘rsatilgan summani o‘zi o‘tkazadi, chekini yuklaydi. Har bir foydalanuvchida bir vaqtning o‘zida bitta tekshirilayotgan chek bo‘ladi. Siz admin hisobingizda **To‘lovlarni tekshirish** bo‘limini ko‘rasiz. Bank hisobingizda pul tushganini tekshiring, keyin tasdiqlang yoki sabab bilan rad eting. Ilova chek rasmini haqiqiy bank tranzaksiyasi ekanini avtomatik tekshirmaydi.

Tasdiqlash tranzaksiyada bajariladi: bir chek ikki marta Pro qo‘sha olmaydi. Mavjud Pro muddati tugamagan bo‘lsa, yangi kunlar uning oxiriga qo‘shiladi. To‘lov yaratilgan paytdagi narx va kunlar saqlanadi; keyingi tarif o‘zgarishi eski chek muddatini o‘zgartirmaydi. Muddati tugaganda samarali fon oq rangga qaytadi. Asosiy vazifalar va eslatmalar bepul qoladi.

Payme/Click hozir ulanmagan. To‘lovlar servisi kelajakdagi provayderni qo‘shish uchun alohida ajratilgan.

## 5. Eslatmalar qanday ishlaydi

- Muddat bazada UTC vaqt sifatida saqlanadi. Sana kiritishda brauzer/qurilmaning vaqt mintaqasi ishlatiladi.
- Telegram matnidagi sana **Sozlamalar → Eslatma vaqt mintaqasi**ga moslanadi.
- Backend har 15 soniyada navbatni tekshiradi; bu real vaqtga yaqin yetkazish, soniyasigacha kafolat emas.
- Yangi vazifa muddatigacha 15 daqiqadan kam qolgan bo‘lsa, faqat muddat kelgandagi eslatma yaratiladi.
- O‘tmishdagi muddat bilan yangi yaratilgan vazifa avtomatik xabar yubormaydi.
- Bajarilgan/o‘chirilgan vazifaning kutilayotgan eslatmalari bekor qilinadi. Muddat o‘zgarsa, jadval yangilanadi.
- Server vaqtincha o‘chgan bo‘lsa, muddat kelgan eslatma qayta yoqilganda yetkaziladi. Muddat o‘tib ketgan “15 daqiqa oldin” xabari tashlab ketiladi.
- In-app yozuv va Telegram yetkazish holati PostgreSQL’da turadi. Telegram tarmoq xatosida kechiktirib qayta urinish bor; doimiy 400/401/403 xatolari qayta yuborilmaydi.
- Telegram yuborishni qabul qilib, javob yo‘qolgan juda kam holatda takror xabar kelishi mumkin: Bot API `sendMessage` idempotency key bermaydi.
- Backend doim ishlashi kerak. Server uxlab qoladigan hostingda aniq vaqt eslatmalari kechikadi.
- Ko‘rinishda oxirgi 100 bildirishnoma, 100 shaxsiy to‘lov va admin uchun 200 to‘lov ko‘rsatiladi. Vazifalar 30 tadan sahifalanadi.

## 6. Buyruqlar

Loyiha ildizida:

| Buyruq | Vazifasi |
| --- | --- |
| `npm.cmd run setup` | Mavjud qiymatlarga tegmasdan lokal `.env` yaratish |
| `npm.cmd run install:all` | Har ikki papkadagi lockfile bo‘yicha paket o‘rnatish |
| `npm.cmd run db:start` | Docker PostgreSQL’ni ishga tushirish va sog‘lom holatini kutish |
| `npm.cmd run db:stop` | Bazani to‘xtatish, ma’lumotlarni saqlash |
| `npm.cmd run db:migrate` | Versiyalangan SQL migratsiyalarini bajarish |
| `npm.cmd run dev` | Frontend + backend development rejimi |
| `npm.cmd run build` | Ikkala loyihani production build qilish |
| `npm.cmd test` | API integratsion testlari |

`.env` o‘zgargandan keyin serverlarni qayta ishga tushiring. Development serverlarini `Ctrl+C` bilan to‘xtating. Docker volume’da ma’lumotlar qayta ishga tushirish orasida saqlanadi. `docker compose down -v` baza ma’lumotlarini o‘chiradi; oddiy to‘xtatish uchun `db:stop` ishlating.

## 7. Arxitektura va xavfsizlik

```text
Browser → Next.js :3000 → /api rewrite → NestJS :3001 → PostgreSQL :5433
                                         ↓
                              Google OAuth / Telegram bot OTP
                                         ↓
                              Telegram reminder worker
```

- Sessiya tasodifiy 256-bit token, bazada faqat SHA-256 xeshi; HttpOnly, SameSite=Lax cookie. 30 kunlik muddat. Production’da Secure va `__Host-` cookie.
- OAuth state brauzer cookie’siga bog‘langan, 10 daqiqalik va bir marta ishlatiladi; PKCE, Google nonce, JWKS imzosi, issuer, audience, exp tekshiruvlari bor. Google uchun state + PKCE majburiy. Telegram kodi brauzerga bog‘langan, xeshlangan, 5 daqiqalik va 5 urinish bilan cheklangan.
- Har bir yozuvchi API so‘rovining `Origin` qiymati `WEB_URL` bilan teng bo‘lishi kerak. Curl/Postman’da mutatsiyalar uchun ham shu headerni qo‘ying.
- Validatsiya noma’lum maydonlarni rad etadi; SQL parametrli; task va receipt egaligi serverda tekshiriladi.
- Backend bitta ishonchli Next.js proxy ortida loopback’da ishlashga sozlangan. Boshqa proxy topologiyasida `setup-app.ts`dagi `trust proxy`ni infratuzilmaga moslang; backendni ishonchsiz mijozlar uchun ochmang.
- Rate limit har IP uchun 240 API so‘rov/minut va 60 auth so‘rov/minut. Bu limiter bitta process xotirasida; bir nechta backend nusxasi uchun umumiy rate-limit store kerak.
- Pro huquqi backendda tekshiriladi. Frontend rangini qo‘lda o‘zgartirish pullik server sozlamasini saqlamaydi.
- Chek fayllari hajm va magic bytes bo‘yicha tekshiriladi; private bytea sifatida bazada, download attachment tarzida beriladi. Bu antivirus skaneri emas.
- Admin huquqi konfiguratsiyadagi tasdiqlangan Google email yoki `ADMIN_TELEGRAM_IDS` orqali dastlab beriladi va bazada saqlanadi. Adminni bekor qilish uchun allowlistdan olib tashlang **va** `users.role`ni `user`ga o‘zgartiring.
- `.env`, `.env.local`, `node_modules`, build natijalari va sinov ma’lumotlari Git’ga kirmaydi. `.env.example` fayllarida haqiqiy kalitlar yo‘q.

## 8. Testlar

`npm test` tashqi hisob yoki Docker talab qilmasdan PGlite’ning PostgreSQL dvigatelida haqiqiy sxema va Nest HTTP marshrutlarini tekshiradi. Bu oddiy SQL mock emas. Testlar alohida xotira bazasida ishlaydi, production bazaga ulanmaydi va haqiqiy Telegram xabarini yubormaydi.

Qamrov: sessiya va Origin, validatsiya, CRUD, qidiruv/filtrlar, foydalanuvchi izolatsiyasi, Pro muddati va fon cheklovi, private chek, admin tasdig‘i, takroriy tasdiq, obuna uzaytirish, eslatma navbati, Telegram retry, explicit account linking va logout. Node’ning `--experimental-vm-modules` ogohlantirishi testdagi WASM/ESM yuklash uchun kutiladi.

Google haqiqiy hisob bilan kirishi client ID/secret va ro‘yxatdan o‘tkazilgan callback bilan tekshiriladi. Telegram uchun bot tokeni va botdan kelgan kod kerak. Botga haqiqiy xabar yuborish testlarda mock qilingan; yakuniy foydalanuvchi kirishini botdagi kod bilan tekshiring. Hech qanday development-login bypass mahsulot kodiga qo‘shilmagan.

Ishlayotgan PostgreSQL bilan ham xuddi shu testlarni bajarish mumkin:

```powershell
cd todo_backend
npm.cmd run test:postgres
```

Bu buyruq `DATABASE_URL` bazasida tasodifiy nomli `todo_test_...` sxema yaratadi, testlarni shu sxemada bajaradi va oxirida faqat shu sxemani o‘chiradi. `public`dagi haqiqiy foydalanuvchi/vazifalarga tegmaydi. Baza foydalanuvchisiga yangi sxema yaratish huquqi kerak. Test jarayoni majburan o‘chirilsa, qolgan test sxemasini alohida tozalash talab qilinishi mumkin.

## 9. Serverga chiqarishdan oldin

1. PostgreSQL serveri va doimiy ishlaydigan Node backend hostingini tayyorlang; backup rejasini belgilang.
2. `NODE_ENV=production`, `WEB_URL=https://your-domain` va haqiqiy `DATABASE_URL` ni qo‘ying. Zarur bo‘lsa `DATABASE_SSL=true`.
3. Google’da HTTPS origin va callbackni ro‘yxatdan o‘tkazing. Telegram uchun bot tokeni, username va pollingni sozlang; callback kerak emas.
4. Frontendning `API_INTERNAL_URL` qiymatini backendning ichki manziliga **build qilishdan oldin** o‘rnating. `NEXT_PUBLIC_` sirlar kerak emas.
5. Migratsiya → backend build/start → frontend build/start. Backendni containerda ishlatsangiz `HOST=0.0.0.0` ni faqat yopiq ichki tarmoqda qo‘llang.
6. HTTPS reverse proxy ishlating. Frontend va `/api` bitta ommaviy origin ostida bo‘lsin.
7. Haqiqiy ikki foydalanuvchi bilan kirish, Telegram ruxsati, chek/admin/Pro va eslatmani tekshiring.

## 10. GitHub’ga yuborish

Bu ish davomida push yoki commit qilinmagan. O‘zingiz tekshirgandan keyin:

```powershell
git status
git diff
git add .
git diff --cached --stat
git commit -m "Build full todo app with OAuth, reminders and manual Pro payments"
git push
```

Commitdan oldin `.env` fayllari ro‘yxatda yo‘qligini tekshiring. Kelajakda rus tili uchun `todo_frontend/lib/i18n.ts`ga lug‘at, `Locale` turiga `ru`, backend validatsiyasi va `users.locale` constraint uchun yangi migratsiya qo‘shiladi. Tarjimalar markazlashtirilgan.

## Hisoblarni birlashtirish va profil

Google va Telegram hisoblari bir odamga tegishli ekanini tasdiqlash uchun Sozlamalar → Ulangan hisoblar ichida ikkinchi usulni ulang. Mavjud alohida hisob bo‘lsa, tasdiqlangandan keyin barcha vazifalar, bildirishnomalar, cheklar, administrator huquqi va qolgan Pro vaqti birlashtiriladi. Joriy hisobning ismi va sozlamalari qoladi; eski sessiyalar yopiladi. Har ikki hisobda turli Google yoki turli Telegram identifikatorlari bo‘lsa, ulash rad etiladi — boshqa identifikator avtomatik almashtirilmaydi.

Yuqori o‘ng yoki chap pastdagi profil tugmasi sozlamalarni ochadi. Profil bo‘limida ismni o‘zgartirib saqlash mumkin. Email faqat tasdiqlangan Google hisobidan olinadi, rolni foydalanuvchi tahrirlay olmaydi.

import type { Locale } from "./types";
// Some embedded browsers ship without Uzbek CLDR month/weekday data.
const months = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];
const weekdays = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];
export function formatDate(
  value: string | Date,
  locale: Locale,
  time = false,
  year = false,
) {
  const d = new Date(value);
  if (locale === "uz")
    return `${d.getDate()}-${months[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}${time ? `, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ""}`;
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    ...(year ? ({ year: "numeric" } as const) : {}),
    ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(d);
}
export function headingDate(locale: Locale) {
  const d = new Date();
  return locale === "uz"
    ? `${weekdays[d.getDay()]}, ${formatDate(d, locale)}`
    : new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(d);
}

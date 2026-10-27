import TodoApp from "@/components/todo-app";
import { author, description, siteUrl } from "@/lib/seo";
export default function Page() {
  const data = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'todos', description, author: { '@type': 'Person', name: author.name, url: author.url, sameAs: [author.url] }, applicationCategory: 'ProductivityApplication', operatingSystem: 'Web', inLanguage: ['uz', 'en'], ...(siteUrl ? { url: siteUrl.href } : {}), featureList: ['Vazifalarni boshqarish', 'Muddat va muhimlik', 'Telegram eslatmalari', 'Google va Telegram orqali kirish'] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }} /><TodoApp /></>;
}

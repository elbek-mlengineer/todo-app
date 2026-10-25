export type Locale = "uz" | "en";
export type Theme =
  "light" | "dark" | "forest" | "lavender" | "sunset" | "ocean";
export type View =
  | "all"
  | "today"
  | "upcoming"
  | "completed"
  | "notifications"
  | "settings"
  | "pro"
  | "admin"
  | "users";
export type Task = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  category: "personal" | "work" | "learning" | "other";
  completed: boolean;
  due_at: string | null;
  reminder: boolean;
  created_at: string;
};
export type User = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  locale: Locale;
  theme: Theme;
  is_pro: boolean;
  can_customize: boolean;
  avatar_url: string | null;
  pro_until: string | null;
  timezone: string;
  providers: string[];
  telegram_connected: boolean;
  telegram_enabled: boolean;
  in_app_enabled: boolean;
};
export type Config = {
  providers: { google: boolean; telegram: boolean };
  payment: {
    enabled: boolean;
    price: number;
    days: number;
    card: string;
    holder: string;
  };
  bot: string | null;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  kind: string;
  read_at: string | null;
  created_at: string;
  telegram_status: string;
};
export type Payment = {
  id: string;
  status: "pending" | "approved" | "rejected";
  price_uzs: number;
  duration_days: number;
  note: string;
  review_note: string;
  created_at: string;
  name?: string;
  email?: string;
};
export type Stats = {
  total: number;
  active: number;
  completed: number;
  overdue: number;
};

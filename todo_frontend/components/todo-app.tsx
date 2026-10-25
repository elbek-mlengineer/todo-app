"use client";
import { AdminUsers } from "./admin-users";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { dictionaries, errorText } from "@/lib/i18n";
import { formatDate, headingDate } from "@/lib/date";
import type {
  Config,
  Locale,
  Notice,
  Stats,
  Task,
  User,
  View,
} from "@/lib/types";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { TaskEditor } from "./task-editor";
import { TelegramLogin } from "./telegram-login";
import { Settings } from "./settings";
import { Payments, AdminPayments } from "./payments";

const taskViews: View[] = ["all", "today", "upcoming", "completed"];
export default function TodoApp() {
  const [locale, setLocale] = useState<Locale>("uz"),
    [user, setUser] = useState<User | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [boot, setBoot] = useState(true),
    [bootError, setBootError] = useState(false),
    [bootKey, setBootKey] = useState(0);
  const [view, setView] = useState<View>("all"),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]),
    [nextTasks, setNextTasks] = useState<Task[]>([]),
    [stats, setStats] = useState<Stats>({
      total: 0,
      active: 0,
      completed: 0,
      overdue: 0,
    });
  const [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [priority, setPriority] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [total, setTotal] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]),
    [unread, setUnread] = useState(0),
    [editor, setEditor] = useState<{ task: Task | null } | null>(null),
    [deleteTask, setDeleteTask] = useState<Task | null>(null),
    [working, setWorking] = useState<string | null>(null);
  const [profileRequest, setProfileRequest] = useState(0);
  useEffect(() => {
    if (view === "settings" && profileRequest > 0)
      document
        .getElementById("profile-settings")
        ?.scrollIntoView({ block: "start" });
  }, [view, profileRequest]);
  function openProfile() {
    navigate("settings");
    setProfileRequest((n) => n + 1);
  }
  const t = dictionaries[locale];
  function notify(text: string) {
    setToast(text);
  }
  function navigate(next: View) {
    setView(next);
    setMenu(false);
    setPage(1);
    setError("");
  }
  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) setUser(null);
    setError(errorText(err, t));
  }
  useEffect(() => {
    let live = true;
    async function load() {
      setBoot(true);
      setBootError(false);
      const preferred = localStorage.getItem("todos-locale");
      if (preferred === "uz" || preferred === "en") setLocale(preferred);
      try {
        const [c, m] = await Promise.all([
          api<Config>("/auth/config"),
          api<{ user: User | null }>("/auth/me"),
        ]);
        if (!live) return;
        setConfig(c);
        setUser(m.user);
        if (m.user) setLocale(m.user.locale);
        const url = new URL(location.href);
        const authError = url.searchParams.get("auth_error");
        if (authError)
          setError(
            errorText(
              new Error(authError),
              dictionaries[
                m.user?.locale || (preferred === "en" ? "en" : "uz")
              ],
            ),
          );
        if (url.searchParams.has("linked"))
          setToast(dictionaries[m.user?.locale || "uz"].linked);
        if (url.search) history.replaceState({}, "", url.pathname);
      } catch {
        if (live) setBootError(true);
      } finally {
        if (live) setBoot(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [bootKey]);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("todos-locale", locale);
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = user?.can_customize
      ? user.theme
      : "light";
    return () => {
      document.documentElement.dataset.theme = "light";
    };
  }, [user?.theme, user?.can_customize]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    async function poll() {
      try {
        const [data, me] = await Promise.all([
          api<{ items: Notice[]; unread: number }>("/notifications"),
          api<{ user: User | null }>("/auth/me"),
        ]);
        if (live) {
          setNotices(data.items);
          setUnread(data.unread);
          setUser(me.user);
        }
      } catch (err) {
        if (live && err instanceof ApiError && err.status === 401)
          setUser(null);
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user?.id, refresh]);
  useEffect(() => {
    if (!user || !taskViews.includes(view)) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      const q = new URLSearchParams({
        page: String(page),
        sort,
        status:
          view === "completed"
            ? "completed"
            : view === "all"
              ? status
              : "active",
      });
      if (debouncedSearch) q.set("search", debouncedSearch);
      if (priority) q.set("priority", priority);
      if (category) q.set("category", category);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      if (view === "today") {
        q.set("from", start.toISOString());
        q.set("to", end.toISOString());
      }
      if (view === "upcoming") q.set("from", end.toISOString());
      try {
        const [list, s, next] = await Promise.all([
          api<{ items: Task[]; total: number; pages: number }>(`/tasks?${q}`, {
            signal: controller.signal,
          }),
          api<Stats>("/tasks/stats", { signal: controller.signal }),
          api<{ items: Task[] }>(
            `/tasks?status=active&sort=due&from=${encodeURIComponent(new Date().toISOString())}`,
            { signal: controller.signal },
          ),
        ]);
        if (!controller.signal.aborted) {
          setTasks(list.items);
          setTotal(list.total);
          setPages(list.pages);
          setStats(s);
          setNextTasks(next.items.slice(0, 3));
          if (page > list.pages) setPage(list.pages);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          if (err instanceof ApiError && err.status === 401) setUser(null);
          setError(errorText(err, dictionaries[locale]));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [
    user?.id,
    view,
    debouncedSearch,
    priority,
    category,
    status,
    sort,
    page,
    refresh,
    locale,
  ]);
  async function language(next: Locale) {
    setLocale(next);
    if (user) {
      try {
        setUser(
          await api<User>("/settings", {
            method: "PATCH",
            body: JSON.stringify({ locale: next }),
          }),
        );
      } catch (err) {
        fail(err);
      }
    }
  }
  async function toggle(task: Task) {
    setWorking(task.id);
    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed }),
      });
      setRefresh((n) => n + 1);
      if (!task.completed) notify(t.taskCompleted);
    } catch (err) {
      fail(err);
    } finally {
      setWorking(null);
    }
  }
  async function remove() {
    if (!deleteTask) return;
    setWorking(deleteTask.id);
    try {
      await api(`/tasks/${deleteTask.id}`, { method: "DELETE" });
      setDeleteTask(null);
      setRefresh((n) => n + 1);
      notify(t.taskDeleted);
    } catch (err) {
      fail(err);
    } finally {
      setWorking(null);
    }
  }
  async function markRead(id?: string) {
    try {
      await api(id ? `/notifications/${id}/read` : "/notifications/read-all", {
        method: "POST",
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      fail(err);
    }
  }
  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setPriority("");
    setCategory("");
    setStatus("all");
    setPage(1);
  }
  const filtered = !!(
    debouncedSearch ||
    priority ||
    category ||
    status !== "all"
  );
  const date = (value: string, includeTime = false) =>
    formatDate(value, locale, includeTime);
  const languagePicker = (
    <div className="language-picker" aria-label={t.language}>
      {(["uz", "en"] as const).map((l) => (
        <button
          key={l}
          className={l === locale ? "selected" : ""}
          onClick={() => void language(l)}
          aria-pressed={l === locale}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
  const logo = (
    <span className="brand">
      <span className="brand-mark">
        <Icon name="check" size={21} />
      </span>
      todos<span className="brand-dot">.</span>
    </span>
  );
  if (boot)
    return (
      <main className="loading-screen">
        {logo}
        <span className="spinner" />
        <p>{t.loading}</p>
      </main>
    );
  if (bootError || !config)
    return (
      <main className="loading-screen">
        {logo}
        <Icon name="info" size={36} />
        <p>{t.connectionError}</p>
        <button
          className="button primary"
          onClick={() => setBootKey((n) => n + 1)}
        >
          {t.retry}
        </button>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <section className="login-story">
          {logo}
          <div className="login-copy">
            <p className="eyebrow">{t.loginEyebrow}</p>
            <h1>
              {t.loginTitle.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </h1>
            <p>{t.loginBody}</p>
            <div className="example-card">
              <div className="example-heading">
                <span className="tiny-dot" />
                {t.example}
                <Icon name="spark" size={18} />
              </div>
              {[t.exampleOne, t.exampleTwo, t.exampleThree].map((text, i) => (
                <div
                  className={`example-task ${i === 2 ? "done" : ""}`}
                  key={text}
                >
                  <span>{i === 2 && <Icon name="check" size={14} />}</span>
                  {text}
                  {i === 0 && <i />}
                </div>
              ))}
              <div className="example-bottom">
                <span>3 {t.tasks}</span>
                <span>{t.exampleTag}</span>
              </div>
            </div>
          </div>
          <div className="login-footer">
            <Icon name="leaf" size={18} />
            {t.tagline}
          </div>
        </section>
        <section className="login-form-side">
          <div className="login-language">{languagePicker}</div>
          <div className="login-form">
            <span className="login-spark">
              <Icon name="spark" size={28} />
            </span>
            <h2>{t.loginHeading}</h2>
            <p className="muted">{t.loginSub}</p>
            <div className="auth-buttons">
              {(["google", "telegram"] as const).map((provider) =>
                config.providers[provider] ? (
                  provider === "telegram" ? (
                    <TelegramLogin key={provider} locale={locale} t={t} />
                  ) : (
                    <a
                      key={provider}
                      className={`auth-button ${provider}`}
                      href={`/api/auth/${provider}/start`}
                    >
                      {provider === "google" ? (
                        <b className="google-g">G</b>
                      ) : (
                        <Icon name="telegram" />
                      )}
                      {t[provider]}
                      <Icon name="arrow" size={17} />
                    </a>
                  )
                ) : (
                  <button
                    key={provider}
                    className="auth-button"
                    disabled
                    title={t.authOneUnavailable}
                  >
                    {provider === "google" ? (
                      <b className="google-g">G</b>
                    ) : (
                      <Icon name="telegram" />
                    )}
                    {t[provider]}
                  </button>
                ),
              )}
            </div>
            {!config.providers.google && !config.providers.telegram && (
              <p className="info-box small">{t.authUnavailable}</p>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <p className="login-privacy">
              <Icon name="lock" size={14} />
              {t.loginFoot}
            </p>
          </div>
          <p className="login-copyright">todos © {new Date().getFullYear()}</p>
        </section>
      </main>
    );
  const progress = stats.total
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;
  const heading =
    view === "all"
      ? t.greeting
      : view === "today"
        ? t.todayTitle
        : view === "upcoming"
          ? t.upcomingTitle
          : view === "completed"
            ? t.completedTitle
            : view === "notifications"
              ? t.notificationsTitle
              : view === "settings"
                ? t.settings
                : view === "users"
                  ? t.users
                  : view === "admin"
                    ? t.adminTitle
                    : t.pro;
  const subtitle =
    view === "all"
      ? t.subtitle
      : view === "today"
        ? t.todaySub
        : view === "upcoming"
          ? t.upcomingSub
          : view === "completed"
            ? t.completedSub
            : view === "notifications"
              ? t.notificationsSub
              : "";
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenu(false)}
          aria-label={t.close}
        />
      )}
      <aside id="main-navigation" className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("all");
          }}
          className="brand-link"
          aria-label="todos"
        >
          {logo}
        </a>
        <p className="workspace-label">{t.workspace}</p>
        <nav aria-label={t.workspace}>
          {taskViews.map((v) => (
            <button
              key={v}
              className={`nav-item ${view === v ? "active" : ""}`}
              onClick={() => navigate(v)}
            >
              <Icon name={v} />
              <span>{t[v]}</span>
              {v === "all" && <span className="nav-count">{stats.active}</span>}
            </button>
          ))}
          <div className="nav-divider" />
          {(["notifications", "settings"] as const).map((v) => (
            <button
              key={v}
              className={`nav-item ${view === v ? "active" : ""}`}
              onClick={() => navigate(v)}
            >
              <Icon name={v === "notifications" ? "bell" : "settings"} />
              <span>{t[v]}</span>
              {v === "notifications" && unread > 0 && (
                <span className="notification-dot">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          ))}
          {user.role === "admin" && (
            <button
              className={`nav-item ${view === "users" ? "active" : ""}`}
              onClick={() => navigate("users")}
            >
              <Icon name="settings" />
              <span>{t.users}</span>
            </button>
          )}
          {user.role === "admin" && (
            <button
              className={`nav-item ${view === "admin" ? "active" : ""}`}
              onClick={() => navigate("admin")}
            >
              <Icon name="shield" />
              <span>{t.admin}</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button className="upgrade-card" onClick={() => navigate("pro")}>
            <span>
              <Icon name="spark" size={20} />
              <b>todos pro</b>
              <Icon name="arrow" size={17} />
            </span>
            <p>{user.is_pro ? t.proActive : t.upgrade}</p>
          </button>
          <div className="sidebar-profile">
            <button
              type="button"
              className="avatar"
              aria-label={t.profile}
              onClick={openProfile}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" />
              ) : (
                Array.from(user.name)[0]
              )}
            </button>
            <div>
              <button
                type="button"
                className="profile-name"
                onClick={openProfile}
              >
                {user.name}
              </button>
              <span>{user.is_pro ? t.proActive : t.free}</span>
            </div>
            <button
              className="icon-button"
              title={t.logout}
              aria-label={t.logout}
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setView("all");
                  setTasks([]);
                  setNotices([]);
                } catch (err) {
                  fail(err);
                }
              }}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t.menu}
              aria-controls="main-navigation"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Icon name="menu" />
            </button>
            <span>todos</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{t[view]}</strong>
          </div>
          <div className="topbar-actions">
            {languagePicker}
            <span className="topbar-line" />
            <button
              className="icon-button bell-button"
              onClick={() => navigate("notifications")}
              aria-label={`${t.notifications}${unread ? ` (${unread})` : ""}`}
            >
              <Icon name="bell" />
              {unread > 0 && <i />}
            </button>
            <button
              type="button"
              className="avatar small-avatar"
              aria-label={t.profile}
              onClick={openProfile}
            >
              {Array.from(user.name)[0]}
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="date-line">{headingDate(locale)}</p>
              <h1>{heading}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {taskViews.includes(view) && (
              <button
                className="button primary new-task"
                onClick={() => setEditor({ task: null })}
              >
                <Icon name="plus" size={19} />
                {t.newTask}
              </button>
            )}
          </div>
          {error && (
            <div className="error-box dismissible" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => {
                  setError("");
                  setRefresh((n) => n + 1);
                }}
                aria-label={t.retry}
              >
                <Icon name="upcoming" size={17} />
              </button>
            </div>
          )}
          {taskViews.includes(view) && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: t.activeTasks,
                    value: stats.active,
                    icon: "all",
                    color: "teal",
                  },
                  {
                    label: t.doneTasks,
                    value: stats.completed,
                    icon: "completed",
                    color: "green",
                  },
                  {
                    label: t.overdueTasks,
                    value: stats.overdue,
                    icon: "upcoming",
                    color: "peach",
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <span className={`stat-icon ${s.color}`}>
                      <Icon name={s.icon} />
                    </span>
                    <div>
                      <span>{s.label}</span>
                      <strong>{s.value.toString().padStart(2, "0")}</strong>
                    </div>
                    <span className="stat-decoration" />
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="task-section">
                  <div className="task-section-heading">
                    <h2>
                      {view === "all" ? t.yourTasks : t[view]}{" "}
                      <span>{total}</span>
                    </h2>
                    <select
                      className="sort-select"
                      aria-label={t.sort}
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="newest">{t.newest}</option>
                      <option value="due">{t.dueSort}</option>
                      <option value="priority">{t.prioritySort}</option>
                    </select>
                  </div>
                  <div className="task-toolbar">
                    <label className="search-box">
                      <Icon name="search" size={18} />
                      <input
                        aria-label={t.searchLabel}
                        placeholder={t.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          className="icon-button"
                          aria-label={t.clearFilters}
                          onClick={() => setSearch("")}
                        >
                          <Icon name="close" size={15} />
                        </button>
                      )}
                    </label>
                    <div className="filter-row">
                      <select
                        aria-label={t.filterPriority}
                        value={priority}
                        onChange={(e) => {
                          setPriority(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">{t.allPriorities}</option>
                        {(["high", "medium", "low"] as const).map((p) => (
                          <option key={p} value={p}>
                            {t[p]}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={t.filterCategory}
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">{t.allCategories}</option>
                        {(
                          ["personal", "work", "learning", "other"] as const
                        ).map((p) => (
                          <option key={p} value={p}>
                            {t[p]}
                          </option>
                        ))}
                      </select>
                      {view === "all" && (
                        <select
                          aria-label={t.filterStatus}
                          value={status}
                          onChange={(e) => {
                            setStatus(e.target.value);
                            setPage(1);
                          }}
                        >
                          <option value="all">{t.allStatuses}</option>
                          <option value="active">{t.active}</option>
                          <option value="completed">{t.completed}</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="task-list" aria-busy={loading}>
                    {loading ? (
                      <div className="list-loading">
                        <span className="spinner" />
                        <p>{t.loading}</p>
                      </div>
                    ) : tasks.length ? (
                      tasks.map((task) => (
                        <article
                          key={task.id}
                          className={`task-row ${task.completed ? "is-complete" : ""}`}
                        >
                          <button
                            className={`task-checkbox ${task.completed ? "checked" : ""}`}
                            disabled={working === task.id}
                            aria-label={`${task.completed ? t.markActive : t.markDone}: ${task.title}`}
                            onClick={() => void toggle(task)}
                          >
                            {task.completed && <Icon name="check" size={15} />}
                          </button>
                          <div className="task-info">
                            <button
                              className="task-title"
                              onClick={() => setEditor({ task })}
                            >
                              {task.title}
                            </button>
                            {task.description && <p>{task.description}</p>}
                            <div className="task-meta">
                              <span
                                className={`category-dot category-${task.category}`}
                              />
                              <span>{t[task.category]}</span>
                              <span className="meta-separator">·</span>
                              <span
                                className={
                                  !task.completed &&
                                  task.due_at &&
                                  new Date(task.due_at).getTime() < Date.now()
                                    ? "date-overdue"
                                    : ""
                                }
                              >
                                <Icon name="today" size={13} />
                                {task.due_at
                                  ? date(task.due_at, true)
                                  : t.noDate}
                              </span>
                              {task.reminder && task.due_at && (
                                <Icon name="bell" size={13} />
                              )}
                            </div>
                          </div>
                          <span
                            className={`priority priority-${task.priority}`}
                          >
                            <i />
                            {t[task.priority]}
                          </span>
                          <div className="task-actions">
                            <button
                              className="icon-button"
                              aria-label={`${t.edit}: ${task.title}`}
                              onClick={() => setEditor({ task })}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label={`${t.delete}: ${task.title}`}
                              onClick={() => setDeleteTask(task)}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">
                        <div className="empty-art">
                          <span />
                          <Icon
                            name={
                              view === "completed"
                                ? "completed"
                                : filtered
                                  ? "search"
                                  : "leaf"
                            }
                            size={38}
                          />
                          <i />
                        </div>
                        <h3>
                          {filtered
                            ? t.noResults
                            : view === "completed"
                              ? t.emptyCompleted
                              : view === "today"
                                ? t.emptyToday
                                : view === "upcoming"
                                  ? t.emptyUpcoming
                                  : t.emptyTitle}
                        </h3>
                        <p>
                          {filtered
                            ? t.noResultsBody
                            : view === "completed"
                              ? t.emptyCompletedBody
                              : view === "today"
                                ? t.emptyTodayBody
                                : view === "upcoming"
                                  ? t.emptyUpcomingBody
                                  : t.emptyBody}
                        </p>
                        <button
                          className="button secondary"
                          onClick={() =>
                            filtered
                              ? clearFilters()
                              : setEditor({ task: null })
                          }
                        >
                          <Icon name={filtered ? "close" : "plus"} size={17} />
                          {filtered ? t.clearFilters : t.newTask}
                        </button>
                      </div>
                    )}
                  </div>
                  {tasks.length > 0 && (
                    <div className="task-list-footer">
                      <span>
                        {total} {t.tasks}
                      </span>
                      <div>
                        <button
                          className="icon-button"
                          aria-label={t.previous}
                          disabled={page <= 1 || loading}
                          onClick={() => setPage((n) => n - 1)}
                        >
                          <Icon
                            name="chevron"
                            size={16}
                            style={{ transform: "rotate(180deg)" }}
                          />
                        </button>
                        <span>
                          {t.page} {page} / {pages}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={t.next}
                          disabled={page >= pages || loading}
                          onClick={() => setPage((n) => n + 1)}
                        >
                          <Icon name="chevron" size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </section>
                <aside className="insights">
                  <section className="momentum-card">
                    <p className="eyebrow">{t.focus}</p>
                    <div
                      className="progress-ring"
                      role="img"
                      aria-label={`${progress}% ${t.finished}`}
                    >
                      <svg viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" />
                        <circle
                          cx="60"
                          cy="60"
                          r="50"
                          strokeDasharray={`${progress * 3.1416} 314.16`}
                        />
                      </svg>
                      <div>
                        <strong>
                          {progress}
                          <small>%</small>
                        </strong>
                        <Icon name="leaf" size={17} />
                      </div>
                    </div>
                    <h3>{t.progress}</h3>
                    <p>
                      {stats.completed} {t.of} {stats.total} {t.finished}
                    </p>
                    <div className="momentum-footer">{t.progressBody}</div>
                  </section>
                  <section className="next-card">
                    <p className="eyebrow">{t.nextUp}</p>
                    {nextTasks.length ? (
                      nextTasks.map((task) => (
                        <button
                          key={task.id}
                          className="next-task"
                          onClick={() => setEditor({ task })}
                        >
                          <span
                            className={`next-dot priority-${task.priority}`}
                          />
                          <span>
                            <strong>{task.title}</strong>
                            <small>
                              {task.due_at && date(task.due_at, true)}
                            </small>
                          </span>
                          <Icon name="chevron" size={15} />
                        </button>
                      ))
                    ) : (
                      <p className="muted small">{t.nothingDue}</p>
                    )}
                  </section>
                  <div className="tip-card">
                    <Icon name="sun" size={22} />
                    <h3>{t.tipTitle}</h3>
                    <p>{t.tip}</p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === "notifications" && (
            <section className="panel notifications-panel">
              <div className="section-heading spread">
                <h2>
                  {t.notifications}{" "}
                  <span className="count-text">
                    {unread} {t.unread}
                  </span>
                </h2>
                <button
                  className="text-button"
                  disabled={!unread}
                  onClick={() => void markRead()}
                >
                  <Icon name="completed" size={17} />
                  {t.markAllRead}
                </button>
              </div>
              {!notices.length ? (
                <div className="empty-state">
                  <div className="empty-art">
                    <Icon name="bell" size={36} />
                  </div>
                  <h3>{t.noNotifications}</h3>
                  <p>{t.noNotificationsBody}</p>
                </div>
              ) : (
                notices.map((n) => (
                  <article
                    key={n.id}
                    className={`notice-row ${!n.read_at ? "unread" : ""}`}
                  >
                    <span className="notice-icon">
                      <Icon name={n.kind === "payment" ? "spark" : "bell"} />
                    </span>
                    <div>
                      <h3>{n.title}</h3>
                      <p>{n.body}</p>
                      <small>{date(n.created_at, true)}</small>
                      {n.telegram_status === "failed" && (
                        <p className="date-overdue small">{t.telegramFailed}</p>
                      )}
                    </div>
                    {!n.read_at && (
                      <button
                        className="icon-button"
                        aria-label={t.markRead}
                        onClick={() => void markRead(n.id)}
                      >
                        <Icon name="check" size={18} />
                      </button>
                    )}
                  </article>
                ))
              )}
            </section>
          )}
          {view === "settings" && (
            <Settings
              user={user}
              config={config}
              t={t}
              onUser={setUser}
              onPro={() => navigate("pro")}
              notify={notify}
            />
          )}
          {view === "pro" && (
            <Payments user={user} config={config} t={t} notify={notify} />
          )}
          {view === "users" && user.role === "admin" && (
            <AdminUsers t={t} locale={locale} />
          )}
          {view === "admin" && user.role === "admin" && (
            <AdminPayments t={t} locale={locale} notify={notify} />
          )}
          <footer className="content-footer">
            <span>todos.</span>
            {t.tagline}
            <Icon name="leaf" size={14} />
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            aria-label={t.close}
            onClick={() => setToast("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {editor && (
        <TaskEditor
          task={editor.task}
          t={t}
          onClose={() => setEditor(null)}
          onSaved={() => {
            notify(editor.task ? t.taskUpdated : t.taskCreated);
            setEditor(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {deleteTask && (
        <Modal
          title={t.deleteTitle}
          subtitle={t.deleteBody}
          closeLabel={t.close}
          onClose={() => !working && setDeleteTask(null)}
        >
          <p className="delete-task-name">{deleteTask.title}</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteTask(null)}
              disabled={!!working}
            >
              {t.cancel}
            </button>
            <button
              className="button danger"
              onClick={() => void remove()}
              disabled={!!working}
            >
              <Icon name="trash" size={17} />
              {t.deleteConfirm}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

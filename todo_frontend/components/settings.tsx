"use client";
import { useState, type FormEvent } from "react";
import { TelegramLogin } from "./telegram-login";
import { Icon } from "./icon";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { errorText, type Texts } from "@/lib/i18n";
import type { Config, Theme, User } from "@/lib/types";
export const themes: Theme[] = [
  "light",
  "dark",
  "forest",
  "lavender",
  "sunset",
  "ocean",
];
export function Settings({
  user,
  config,
  t,
  onUser,
  onPro,
  notify,
}: {
  user: User;
  config: Config;
  t: Texts;
  onUser: (u: User) => void;
  onPro: () => void;
  notify: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function photo(file?: File, remove = false) {
    if (!remove && (!file || file.size > 3 * 1024 * 1024)) {
      setError(t.errorAvatar);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      if (file) body.append("file", file);
      onUser(
        await api<User>("/profile/avatar", {
          method: remove ? "DELETE" : "POST",
          ...(remove ? {} : { body }),
        }),
      );
      notify(t.saved);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function patch(body: unknown) {
    setBusy(true);
    setError("");
    try {
      onUser(
        await api<User>("/settings", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      );
      notify(t.saved);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void patch({
      timezone: data.get("timezone"),
      in_app_enabled: data.get("in_app_enabled") === "on",
      telegram_enabled: data.get("telegram_enabled") === "on",
    });
  }
  const zones = [
    ...new Set([
      user.timezone,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "Asia/Tashkent",
      "Asia/Samarkand",
      "Europe/London",
      "Europe/Moscow",
      "Europe/Berlin",
      "America/New_York",
      "Asia/Dubai",
      "Asia/Seoul",
      "Asia/Tokyo",
      "UTC",
    ]),
  ];
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="section-heading">
          <span className="panel-icon">
            <Icon name="settings" />
          </span>
          <div>
            <h2>{t.appearance}</h2>
            <p>{t.appearanceSub}</p>
          </div>
        </div>
        <div className="theme-grid">
          {themes.map((theme) => (
            <button
              key={theme}
              className={`theme-option ${user.theme === theme ? "selected" : ""}`}
              onClick={() =>
                theme !== "light" && !user.can_customize
                  ? onPro()
                  : void patch({ theme })
              }
              disabled={busy}
              aria-label={`${t[theme]}${theme !== "light" && !user.can_customize ? ` · ${t.proOnly}` : ""}`}
              aria-pressed={user.theme === theme}
            >
              <span className={`theme-preview preview-${theme}`}>
                <span />
                <span />
                <i />
                {user.theme === theme && (
                  <b>
                    <Icon name="check" size={14} />
                  </b>
                )}
              </span>
              <span>
                {t[theme]}
                {theme !== "light" && !user.can_customize && (
                  <Icon name="lock" size={13} />
                )}
              </span>
            </button>
          ))}
        </div>
        {!user.can_customize && (
          <button className="text-button" onClick={onPro}>
            <Icon name="spark" size={16} />
            {t.proOnly}
            <Icon name="arrow" size={16} />
          </button>
        )}
      </section>
      <section
        className="panel"
        id="profile-settings"
        style={{ scrollMarginTop: 90 }}
      >
        <h2>{t.profile}</h2>
        <div className="account-card">
          <span className="avatar large">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" />
            ) : (
              Array.from(user.name)[0]
            )}
          </span>
          <div>
            <strong>{user.name}</strong>
            <p>{user.email || "Telegram"}</p>
            {user.role === "admin" && (
              <span className="badge">{t.administrator}</span>
            )}
            <span className={`badge ${user.is_pro ? "pro-badge" : ""}`}>
              {user.is_pro ? t.proActive : t.free}
            </span>
          </div>
        </div>
        <div className="form-stack">
          <label>
            {t.uploadPhoto}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void photo(f);
                e.target.value = "";
              }}
            />
          </label>
          <small className="muted">{t.photoHelp}</small>
          {user.avatar_url && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void photo(undefined, true)}
            >
              {t.removePhoto}
            </button>
          )}
        </div>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void patch({ name: String(data.get("name") || "").trim() });
          }}
        >
          <label>
            {t.profileName}
            <input
              key={user.name}
              name="name"
              defaultValue={user.name}
              minLength={1}
              maxLength={100}
              required
              autoComplete="name"
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? t.saving : t.saveProfile}
          </button>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
        </form>
        {user.is_pro && user.pro_until && (
          <p className="muted">
            {t.until}: {formatDate(user.pro_until, user.locale, false, true)}
          </p>
        )}
        <hr />
        <h3>{t.connections}</h3>
        <p className="muted small">{t.connectHelp}</p>
        {(["google", "telegram"] as const).map((provider) => (
          <div className="connection-row" key={provider}>
            <span>
              {provider === "google" ? (
                <b className="google-g">G</b>
              ) : (
                <Icon name="telegram" />
              )}
              {provider === "google" ? "Google" : "Telegram"}
            </span>
            {user.providers.includes(provider) ? (
              <span className="connected">
                <Icon name="check" size={15} />
                {t.connected}
              </span>
            ) : config.providers[provider] ? (
              provider === "telegram" ? (
                <TelegramLogin locale={user.locale} t={t} link />
              ) : (
                <a
                  className="button secondary compact"
                  href={`/api/auth/${provider}/start?link=1`}
                >
                  {t.connect}
                </a>
              )
            ) : (
              <span className="muted small">{t.authOneUnavailable}</span>
            )}
          </div>
        ))}
      </section>
      <section className="panel settings-notifications">
        <h2>{t.notificationSettings}</h2>
        <form onSubmit={submit} className="form-stack">
          <label className="toggle-row">
            <span>
              <strong>{t.inApp}</strong>
              <small>{t.inAppHelp}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              name="in_app_enabled"
              defaultChecked={user.in_app_enabled}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>{t.telegramNotifications}</strong>
              <small>
                {user.telegram_connected
                  ? t.telegramHelp
                  : t.connectTelegramFirst}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              name="telegram_enabled"
              defaultChecked={user.telegram_enabled}
              disabled={!user.telegram_connected}
            />
          </label>
          <label>
            {t.timezone}
            <select name="timezone" defaultValue={user.timezone}>
              {zones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
            <small className="muted">{t.timezoneHelp}</small>
          </label>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? t.saving : t.saveSettings}
          </button>
        </form>
      </section>
    </div>
  );
}

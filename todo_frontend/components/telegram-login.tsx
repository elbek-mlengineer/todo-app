"use client";
import { useState, useEffect, type FormEvent } from "react";
import { api } from "@/lib/api";
import { errorText, type Texts } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { Modal } from "./modal";
import { Icon } from "./icon";
export function TelegramLogin({
  locale,
  t,
  link = false,
}: {
  locale: Locale;
  t: Texts;
  link?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<{
    botUrl: string;
    expiresAt: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(300);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!flow || !open) return;
    const tick = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil((Date.parse(flow.expiresAt) - Date.now()) / 1000),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [flow, open]);
  async function begin() {
    setOpen(true);
    setBusy(true);
    setError("");
    setCode("");
    setFlow(null);
    setLocked(false);
    try {
      setFlow(
        await api("/auth/telegram/begin", {
          method: "POST",
          body: JSON.stringify({ link, locale }),
        }),
      );
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/telegram/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      window.location.assign(link ? "/?linked=1" : "/?signed_in=1");
    } catch (e) {
      setError(errorText(e, t));
      if (
        e instanceof Error &&
        ["TELEGRAM_CODE_LOCKED", "TELEGRAM_CODE_EXPIRED"].includes(e.message)
      )
        setLocked(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={link ? "button secondary compact" : "auth-button telegram"}
        onClick={() => void begin()}
        disabled={busy}
      >
        {!link && <Icon name="telegram" />}
        {link ? t.connect : t.telegram}
        {!link && <Icon name="arrow" size={17} />}
      </button>
      {open && (
        <Modal
          title={t.telegramCodeTitle}
          subtitle={t.telegramCodeHelp}
          closeLabel={t.close}
          onClose={() => setOpen(false)}
        >
          <div className="form-stack">
            {flow && (
              <>
                <a
                  className="button primary"
                  href={flow.botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="telegram" />
                  {t.telegramOpenBot}
                </a>
                <p className="muted small">{t.telegramCodeInstructions}</p>
                <form className="form-stack" onSubmit={verify}>
                  <label>
                    {t.telegramCodeLabel}
                    <input
                      name="telegram-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      required
                      placeholder="000000"
                    />
                  </label>
                  <p
                    className="muted small"
                    aria-live={remaining === 0 ? "polite" : "off"}
                  >
                    {remaining > 0
                      ? t.telegramCodeExpires +
                        " " +
                        Math.floor(remaining / 60) +
                        ":" +
                        String(remaining % 60).padStart(2, "0")
                      : t.telegramCodeExpired}
                  </p>
                  <button
                    className="button primary"
                    disabled={
                      busy || code.length !== 6 || remaining === 0 || locked
                    }
                  >
                    {busy ? t.loading : t.telegramCodeVerify}
                  </button>
                </form>
              </>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            {(!flow || remaining === 0 || locked) && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void begin()}
              >
                {busy ? t.loading : t.telegramCodeRestart}
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

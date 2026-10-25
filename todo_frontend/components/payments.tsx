"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { errorText, type Texts } from "@/lib/i18n";
import type { Config, Locale, Payment, User } from "@/lib/types";
import { Icon } from "./icon";
import { Modal } from "./modal";
export function Payments({
  user,
  config,
  t,
  notify,
}: {
  user: User;
  config: Config;
  t: Texts;
  notify: (s: string) => void;
}) {
  const [items, setItems] = useState<Payment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    api<Payment[]>("/payments")
      .then((data) => {
        if (live) setItems(data);
      })
      .catch((err) => {
        if (live) setError(errorText(err, t));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [t]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form),
      file = data.get("receipt");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) {
      setError(t.errorReceipt);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/payments", { method: "POST", body: data });
      setItems(await api<Payment[]>("/payments"));
      form.reset();
      notify(t.receiptSent);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  const p = config.payment;
  return (
    <div className="pro-layout">
      <section className="pro-feature">
        <span className="pro-symbol">
          <Icon name="spark" size={30} />
        </span>
        <p className="eyebrow">{t.proEyebrow}</p>
        <h2>{t.proTitle}</h2>
        <p>{t.proBody}</p>
        <div className="mini-themes">
          <i className="preview-dark" />
          <i className="preview-forest" />
          <i className="preview-lavender" />
          <i className="preview-sunset" />
          <i className="preview-ocean" />
        </div>
        <ul className="feature-list">
          {[t.proFeatureOne, t.proFeatureTwo, t.proFeatureThree].map((s) => (
            <li key={s}>
              <Icon name="check" size={18} />
              {s}
            </li>
          ))}
        </ul>
        {p.enabled && (
          <div className="price">
            {p.price.toLocaleString(user.locale)}{" "}
            <span>
              {t.sum} / {p.days} {t.days}
            </span>
          </div>
        )}
        {user.is_pro && <span className="badge pro-badge">{t.proActive}</span>}
      </section>
      <div>
        <section className="panel">
          <h2>{t.paymentTitle}</h2>
          {!p.enabled ? (
            <p className="info-box">{t.paymentDisabled}</p>
          ) : items.some((i) => i.status === "pending") ? (
            <p className="info-box">
              <Icon name="upcoming" />
              {t.pendingNotice}
            </p>
          ) : (
            <>
              <ol className="payment-steps">
                <li>{t.paymentStepOne}</li>
                <li>{t.paymentStepTwo}</li>
                <li>{t.paymentStepThree}</li>
              </ol>
              <div className="bank-card">
                <div className="bank-card-top">
                  <span>todos pro</span>
                  <Icon name="shield" />
                </div>
                <strong>
                  {p.card
                    .replace(/\s/g, "")
                    .replace(/(.{4})/g, "$1 ")
                    .trim()}
                </strong>
                <div className="bank-card-bottom">
                  <span>
                    <small>{t.cardHolder}</small>
                    {p.holder}
                  </span>
                  <button
                    type="button"
                    aria-label={t.copy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          p.card.replace(/\s/g, ""),
                        );
                        setCopied(true);
                      } catch {
                        setError(t.errorGeneric);
                      }
                    }}
                  >
                    <Icon name={copied ? "check" : "copy"} size={17} />
                    {copied ? t.copied : t.copy}
                  </button>
                </div>
              </div>
              <form onSubmit={submit} className="form-stack">
                <label className="upload-label">
                  <Icon name="upload" size={26} />
                  <strong>{t.receipt}</strong>
                  <span>{t.receiptHelp}</span>
                  <input
                    type="file"
                    name="receipt"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    required
                  />
                </label>
                <label>
                  {t.paymentNote}
                  <textarea name="note" rows={2} maxLength={500} />
                </label>
                <button
                  className="button primary full"
                  disabled={busy || loading}
                >
                  {busy ? t.submitting : t.submitReceipt}
                  <Icon name="arrow" size={17} />
                </button>
              </form>
            </>
          )}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
        </section>
        <section className="panel payment-history">
          <h2>{t.paymentHistory}</h2>
          {loading ? (
            <p className="muted">{t.loading}</p>
          ) : !items.length ? (
            <p className="muted">{t.noPayments}</p>
          ) : (
            items.map((item) => (
              <div className="payment-row" key={item.id}>
                <div>
                  <strong>
                    {item.price_uzs.toLocaleString(user.locale)} {t.sum}
                  </strong>
                  <small>
                    {formatDate(item.created_at, user.locale, false, true)} ·{" "}
                    {item.duration_days} {t.days}
                  </small>
                  {item.review_note && (
                    <p className="review-note">{item.review_note}</p>
                  )}
                  <a
                    className="text-button small"
                    href={`/api/payments/${item.id}/receipt`}
                  >
                    {t.downloadReceipt}
                  </a>
                </div>
                <span className={`badge status-${item.status}`}>
                  {t[item.status]}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
export function AdminPayments({
  t,
  locale,
  notify,
}: {
  t: Texts;
  locale: Locale;
  notify: (s: string) => void;
}) {
  const [items, setItems] = useState<Payment[]>([]),
    [review, setReview] = useState<Payment | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    api<Payment[]>("/admin/payments")
      .then((data) => {
        if (live) setItems(data);
      })
      .catch((err) => {
        if (live) setError(errorText(err, t));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [t]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!review) return;
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement;
    try {
      await api(`/admin/payments/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: submitter.value,
          note: data.get("note"),
        }),
      });
      setItems(await api<Payment[]>("/admin/payments"));
      setReview(null);
      notify(t.reviewed);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <p className="info-box">
          <Icon name="shield" />
          {t.adminSub}
        </p>
        {loading ? (
          <p>{t.loading}</p>
        ) : !items.length ? (
          <p className="muted">{t.noPayments}</p>
        ) : (
          <div className="admin-list">
            {items.map((item) => (
              <div className="admin-row" key={item.id}>
                <span className="avatar">{item.name?.[0] || "U"}</span>
                <div className="admin-person">
                  <strong>{item.name}</strong>
                  <small>{item.email || "Telegram"}</small>
                  <small>
                    {formatDate(item.created_at, locale, true, true)}
                  </small>
                  {item.note && <p className="review-note">{item.note}</p>}
                </div>
                <div>
                  <strong>
                    {item.price_uzs.toLocaleString()} {t.sum}
                  </strong>
                  <small>
                    {item.duration_days} {t.days}
                  </small>
                </div>
                <span className={`badge status-${item.status}`}>
                  {t[item.status]}
                </span>
                <a
                  href={`/api/payments/${item.id}/receipt`}
                  className="icon-button"
                  aria-label={t.downloadReceipt}
                >
                  <Icon name="file" />
                </a>
                {item.status === "pending" && (
                  <button
                    className="button secondary compact"
                    onClick={() => setReview(item)}
                  >
                    {t.reviewTitle}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {error && !review && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </section>
      {review && (
        <Modal
          title={t.reviewTitle}
          subtitle={t.reviewHelp}
          closeLabel={t.close}
          onClose={() => !busy && setReview(null)}
        >
          <form className="form-stack" onSubmit={submit}>
            <div className="info-box">
              {review.name} · {review.price_uzs.toLocaleString()} {t.sum} ·{" "}
              {review.duration_days} {t.days}
            </div>
            <a
              href={`/api/payments/${review.id}/receipt`}
              className="text-button"
            >
              {t.downloadReceipt}
              <Icon name="file" size={16} />
            </a>
            <label>
              {t.reviewNote}
              <textarea name="note" rows={3} maxLength={500} />
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button danger"
                type="submit"
                value="rejected"
                disabled={busy}
              >
                {t.reject}
              </button>
              <button
                className="button primary"
                type="submit"
                value="approved"
                disabled={busy}
              >
                {busy ? t.saving : t.approve}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

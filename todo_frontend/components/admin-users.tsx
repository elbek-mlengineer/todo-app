"use client";
import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { api } from "@/lib/api";
import { errorText, type Texts } from "@/lib/i18n";
import { formatDate } from "@/lib/date";
import type { Locale, User } from "@/lib/types";
type Entry = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  is_pro: boolean;
  pro_until: string | null;
  providers: string[];
  task_count: number;
  created_at: string;
};
export function AdminUsers({
  t,
  locale,
  user,
  onUser,
}: {
  t: Texts;
  locale: Locale;
  user: User;
  onUser: (u: User) => void;
}) {
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{
      items: Entry[];
      total: number;
      pages: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entry | null>(null),
    [deleting, setDeleting] = useState<Entry | null>(null);
  const [proAction, setProAction] = useState("keep"),
    [confirmation, setConfirmation] = useState(""),
    [mutationError, setMutationError] = useState(""),
    [busy, setBusy] = useState(false);
  function edit(entry: Entry, action = "keep") {
    setSelected(entry);
    setProAction(action);
    setMutationError("");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMutationError("");
    const values = new FormData(e.currentTarget);
    try {
      await api("/admin/users/" + selected.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(values.get("name") || "").trim(),
          ...(proAction === "keep"
            ? {}
            : {
                pro_days:
                  proAction === "remove" ? 0 : Number(values.get("days")),
              }),
        }),
      });
      if (selected.id === user.id) {
        const me = await api<{ user: User }>("/auth/me").catch(() => null);
        if (me) onUser(me.user);
      }
      setSelected(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setMutationError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deleting || busy) return;
    setBusy(true);
    setMutationError("");
    try {
      await api("/admin/users/" + deleting.id, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      setDeleting(null);
      if (data?.items.length === 1 && page > 1) setPage((p) => p - 1);
      else setRefresh((n) => n + 1);
    } catch (e) {
      setMutationError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<{ items: Entry[]; total: number; pages: number }>(
      "/admin/users?" + new URLSearchParams({ q: search, page: String(page) }),
    )
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(errorText(e, t));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [search, page, refresh, t]);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{t.users}</h2>
          <p>{t.usersHelp}</p>
        </div>
      </div>
      <label className="form-stack">
        {t.searchUsers}
        <input
          type="search"
          maxLength={100}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {error ? (
        <div role="alert" className="error-box">
          {error}
          <button
            className="button secondary"
            onClick={() => setRefresh((n) => n + 1)}
          >
            {t.retry}
          </button>
        </div>
      ) : loading ? (
        <p role="status">{t.loading}</p>
      ) : (
        data && (
          <>
            <p className="muted">
              {t.totalUsers}: {data.total}
            </p>
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>{t.profileName}</th>
                    <th>Email</th>
                    <th>{t.accountRole}</th>
                    <th>{t.accountPlan}</th>
                    <th>{t.connections}</th>
                    <th>{t.all}</th>
                    <th>{t.joinedAt}</th>
                    <th>{t.userActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email || "—"}</td>
                      <td>
                        {u.role === "admin" ? t.administrator : t.regularUser}
                      </td>
                      <td>
                        {u.is_pro ? t.proActive : t.free}
                        {u.is_pro && u.pro_until && (
                          <small className="muted" style={{ display: "block" }}>
                            {t.until}:{" "}
                            {formatDate(u.pro_until, locale, false, true)}
                          </small>
                        )}
                      </td>
                      <td>{u.providers.join(" / ") || "—"}</td>
                      <td>{u.task_count}</td>
                      <td>{formatDate(u.created_at, locale, false, true)}</td>
                      <td>
                        <div className="user-actions">
                          <button
                            className="button secondary compact"
                            onClick={() => edit(u)}
                          >
                            {t.editUser}
                          </button>
                          <button
                            className="button secondary compact"
                            onClick={() => edit(u, "add")}
                          >
                            {t.grantPro}
                          </button>
                          <button
                            className="button secondary compact"
                            disabled={u.id === user.id}
                            title={
                              u.id === user.id ? t.cannotDeleteSelf : undefined
                            }
                            onClick={() => {
                              setDeleting(u);
                              setConfirmation("");
                              setMutationError("");
                            }}
                          >
                            {t.deleteUser}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.items.length === 0 && <p>{t.noUsers}</p>}
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t.previous}
              </button>
              <span>
                {t.page} {page} / {data.pages}
              </span>
              <button
                className="button secondary"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.next}
              </button>
            </div>
          </>
        )
      )}
      {selected && (
        <Modal
          title={t.editUser}
          subtitle={selected.email || selected.name}
          closeLabel={t.close}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <form className="form-stack" onSubmit={save}>
            <label>
              {t.profileName}
              <input
                name="name"
                defaultValue={selected.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              {t.accountPlan}
              <select
                value={proAction}
                onChange={(e) => setProAction(e.target.value)}
              >
                <option value="keep">{t.keepPlan}</option>
                <option value="add">{t.grantPro}</option>
                <option value="remove">{t.revokePro}</option>
              </select>
            </label>
            {proAction === "add" && (
              <label>
                {t.proDays}
                <input
                  type="number"
                  name="days"
                  min={1}
                  max={3660}
                  defaultValue={30}
                  required
                />
                <small className="muted">{t.proDaysHelp}</small>
              </label>
            )}
            {proAction === "remove" && (
              <p className="info-box">{t.revokeProHelp}</p>
            )}
            {mutationError && (
              <p role="alert" className="error-box">
                {mutationError}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? t.saving : t.saveProfile}
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={t.deleteUser}
          subtitle={deleting.email || deleting.name}
          closeLabel={t.close}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <form className="form-stack" onSubmit={remove}>
            <p className="error-box">{t.deleteUserWarning}</p>
            <label>
              {t.confirmUserName}: <strong>{deleting.name}</strong>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            {mutationError && (
              <p role="alert" className="error-box">
                {mutationError}
              </p>
            )}
            <button
              className="button danger"
              disabled={busy || confirmation !== deleting.name}
            >
              {busy ? t.saving : t.deleteUser}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

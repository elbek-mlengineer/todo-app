"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { errorText, type Texts } from "@/lib/i18n";
import { formatDate } from "@/lib/date";
import type { Locale } from "@/lib/types";
type Entry = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  is_pro: boolean;
  providers: string[];
  task_count: number;
  created_at: string;
};
export function AdminUsers({ t, locale }: { t: Texts; locale: Locale }) {
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
                      <td>{u.is_pro ? t.proActive : t.free}</td>
                      <td>{u.providers.join(" / ") || "—"}</td>
                      <td>{u.task_count}</td>
                      <td>{formatDate(u.created_at, locale, false, true)}</td>
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
    </section>
  );
}

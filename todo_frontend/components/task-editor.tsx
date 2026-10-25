"use client";
import { useState, type FormEvent } from "react";
import { Modal } from "./modal";
import { Icon } from "./icon";
import { api } from "@/lib/api";
import { errorText, type Texts } from "@/lib/i18n";
import type { Task } from "@/lib/types";
function inputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function TaskEditor({
  task,
  t,
  onClose,
  onSaved,
}: {
  task: Task | null;
  t: Texts;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget),
      due = String(data.get("due_at") || "");
    try {
      await api(task ? `/tasks/${task.id}` : "/tasks", {
        method: task ? "PATCH" : "POST",
        body: JSON.stringify({
          title: String(data.get("title")).trim(),
          description: data.get("description"),
          priority: data.get("priority"),
          category: data.get("category"),
          due_at: due ? new Date(due).toISOString() : null,
          reminder: data.get("reminder") === "on",
        }),
      });
      onSaved();
    } catch (err) {
      setError(errorText(err, t));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? t.editTitle : t.addTitle}
      subtitle={task ? t.editSub : t.addSub}
      closeLabel={t.close}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          {t.title}
          <input
            name="title"
            placeholder={t.titlePlaceholder}
            defaultValue={task?.title}
            required
            maxLength={160}
            autoFocus
          />
        </label>
        <label>
          {t.description}
          <textarea
            name="description"
            placeholder={t.descriptionPlaceholder}
            defaultValue={task?.description}
            maxLength={4000}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <label>
            {t.priority}
            <select name="priority" defaultValue={task?.priority || "medium"}>
              {(["low", "medium", "high"] as const).map((p) => (
                <option key={p} value={p}>
                  {t[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.category}
            <select name="category" defaultValue={task?.category || "personal"}>
              {(["personal", "work", "learning", "other"] as const).map((p) => (
                <option key={p} value={p}>
                  {t[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t.dueDate}
          <input
            name="due_at"
            type="datetime-local"
            defaultValue={inputDate(task?.due_at)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            name="reminder"
            defaultChecked={task?.reminder ?? true}
          />
          <span>
            {t.reminder}
            <small>{t.reminderHelp}</small>
          </span>
          <Icon name="bell" />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            {t.cancel}
          </button>
          <button className="button primary" disabled={busy}>
            <Icon name="plus" size={18} />
            {busy ? t.saving : task ? t.save : t.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}

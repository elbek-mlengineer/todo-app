import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from './database.service';
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(RemindersService.name);
  constructor(private readonly db: DatabaseService) {}
  onModuleInit() {
    if (process.env.REMINDERS_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.tick(), 15000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.materialize();
      await this.deliver();
      await this.cleanup();
    } catch {
      this.logger.warn(
        'Reminder processing failed; retrying on the next interval. Check database connectivity.',
      );
    } finally {
      this.running = false;
    }
  }
  async materialize() {
    await this.db.transaction(async (db) => {
      const { rows } = await db.query(
        `SELECT r.*,t.user_id,t.title,t.due_at,t.completed,t.reminder,t.revision AS current_revision,u.locale,u.timezone,u.telegram_chat_id,u.telegram_enabled,u.in_app_enabled FROM reminders r JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=t.user_id WHERE r.deliver_at<=now() ORDER BY r.deliver_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED`,
      );
      for (const row of rows) {
        const staleSoon =
          row.kind === 'soon' && new Date(row.due_at).getTime() <= Date.now();
        if (
          !row.completed &&
          row.reminder &&
          row.revision === row.current_revision &&
          !staleSoon
        ) {
          const uz = row.locale === 'uz';
          const time = new Intl.DateTimeFormat(uz ? 'uz-UZ' : 'en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: row.timezone,
          }).format(new Date(row.due_at));
          const body = uz
            ? `${row.kind === 'soon' ? 'Muddat yaqinlashmoqda' : 'Vazifa muddati keldi'}: ${time}`
            : `${row.kind === 'soon' ? 'Your task is due soon' : 'Your task is due'}: ${time}`;
          await db.query(
            'INSERT INTO notifications(user_id,task_id,kind,title,body,visible,telegram_status) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              row.user_id,
              row.task_id,
              row.kind,
              row.title,
              body,
              row.in_app_enabled,
              row.telegram_chat_id && row.telegram_enabled ? 'pending' : 'skip',
            ],
          );
        }
        await db.query('DELETE FROM reminders WHERE id=$1', [row.id]);
      }
    });
  }
  async deliver() {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    for (let i = 0; i < 20; i++) {
      const row = await this.db.transaction(async (db) => {
        const item = (
          await db.query(
            `SELECT n.*,u.telegram_chat_id,u.telegram_enabled FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.telegram_status='pending' AND n.telegram_retry_at<=now() AND (n.telegram_lease_until IS NULL OR n.telegram_lease_until<now()) ORDER BY n.created_at LIMIT 1 FOR UPDATE OF n SKIP LOCKED`,
          )
        ).rows[0];
        if (!item) return null;
        await db.query(
          "UPDATE notifications SET telegram_lease_until=now()+interval '60 seconds',telegram_attempts=telegram_attempts+1 WHERE id=$1",
          [item.id],
        );
        return item;
      });
      if (!row) break;
      if (!row.telegram_chat_id || !row.telegram_enabled) {
        await this.db.query(
          "UPDATE notifications SET telegram_status='skip' WHERE id=$1",
          [row.id],
        );
        continue;
      }
      if (row.kind !== 'payment') {
        const task = row.task_id
          ? (
              await this.db.query(
                'SELECT completed,reminder FROM tasks WHERE id=$1',
                [row.task_id],
              )
            ).rows[0]
          : null;
        if (!task || task.completed || !task.reminder) {
          await this.db.query(
            "UPDATE notifications SET telegram_status='skip' WHERE id=$1",
            [row.id],
          );
          continue;
        }
      }
      let sent = false,
        permanent = false,
        retryAfter = 0;
      try {
        const result = await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: row.telegram_chat_id,
              text: `✓ ${row.title}\n\n${row.body}`,
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        const body = await result.json();
        sent = result.ok && body.ok === true;
        permanent = [400, 401, 403].includes(result.status);
        retryAfter = Number(body.parameters?.retry_after) || 0;
      } catch {
        /* Network errors are retried without logging bot credentials. */
      }
      const status = sent
        ? 'sent'
        : permanent || row.telegram_attempts >= 7
          ? 'failed'
          : 'pending';
      const seconds = Math.max(
        retryAfter,
        Math.min(3600, 30 * 2 ** row.telegram_attempts),
      );
      await this.db.query(
        "UPDATE notifications SET telegram_status=$2,telegram_lease_until=NULL,telegram_retry_at=now()+($3 * interval '1 second') WHERE id=$1",
        [row.id, status, seconds],
      );
    }
  }
  async cleanup() {
    await this.db.query('DELETE FROM oauth_states WHERE expires_at<now()');
    await this.db.query('DELETE FROM sessions WHERE expires_at<now()');
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { DatabaseService } from './database.service';
import { AuthService, digest } from './auth.service';
import { cookieOptions, sessionCookie, webUrl } from './config';

const cookie = 'todo_telegram_login';
export const botUsername = () =>
  (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
export const botConfigured = () =>
  !!process.env.TELEGRAM_BOT_TOKEN?.trim() &&
  /^[a-zA-Z0-9_]{5,32}$/.test(botUsername());
@Injectable()
export class TelegramLoginService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramLoginService.name);
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private abort?: AbortController;
  private task?: Promise<void>;
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  async begin(req: Request, res: Response, link: boolean, locale: 'uz' | 'en') {
    if (!botConfigured())
      throw new ServiceUnavailableException('PROVIDER_NOT_CONFIGURED');
    const user = await this.auth.current(req);
    if (link && !user) throw new UnauthorizedException('AUTH_REQUIRED');
    const token = randomBytes(32).toString('base64url');
    const browser = randomBytes(32).toString('base64url');
    const old = req.cookies?.[cookie];
    await this.db.transaction(async (db) => {
      await db.query(
        'DELETE FROM telegram_login_challenges WHERE expires_at<now() OR browser_hash=$1',
        [typeof old === 'string' ? digest(old) : ''],
      );
      await db.query(
        'INSERT INTO telegram_login_challenges(token_hash,browser_hash,link_user_id,locale) VALUES($1,$2,$3,$4)',
        [digest(token), digest(browser), link ? user.id : null, locale],
      );
    });
    res.cookie(cookie, browser, { ...cookieOptions, maxAge: 300000 });
    return {
      botUrl: 'https://t.me/' + botUsername() + '?start=login_' + token,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
  }

  async verify(req: Request, res: Response, code: string) {
    const browser = req.cookies?.[cookie];
    if (typeof browser !== 'string')
      throw new UnauthorizedException('TELEGRAM_CODE_EXPIRED');
    const current = await this.auth.current(req);
    const result = await this.db.transaction(async (db) => {
      const flow = (
        await db.query(
          'SELECT * FROM telegram_login_challenges WHERE browser_hash=$1 FOR UPDATE',
          [digest(browser)],
        )
      ).rows[0];
      if (!flow || new Date(flow.expires_at).getTime() <= Date.now())
        return { error: 'TELEGRAM_CODE_EXPIRED' };
      if (flow.attempts >= 5) return { error: 'TELEGRAM_CODE_LOCKED' };
      if (flow.link_user_id && current?.id !== flow.link_user_id)
        return { error: 'AUTH_REQUIRED' };
      if (!flow.code_hash) return { error: 'TELEGRAM_CODE_NOT_SENT' };
      if (
        !timingSafeEqual(
          Buffer.from(flow.code_hash, 'hex'),
          Buffer.from(digest(flow.token_hash + ':' + code), 'hex'),
        )
      ) {
        await db.query(
          'UPDATE telegram_login_challenges SET attempts=attempts+1 WHERE token_hash=$1',
          [flow.token_hash],
        );
        return {
          error:
            flow.attempts >= 4
              ? 'TELEGRAM_CODE_LOCKED'
              : 'TELEGRAM_CODE_INVALID',
        };
      }
      const userId = await this.auth.identity(
        'telegram',
        {
          sub: 'bot:' + flow.telegram_id,
          id: Number(flow.telegram_id),
          name: flow.telegram_name,
        },
        flow.link_user_id,
        db,
      );
      await db.query(
        'DELETE FROM telegram_login_challenges WHERE token_hash=$1',
        [flow.token_hash],
      );
      if (typeof req.cookies?.[sessionCookie] === 'string')
        await db.query('DELETE FROM sessions WHERE token_hash=$1', [
          digest(req.cookies[sessionCookie]),
        ]);
      return { userId };
    });
    if (result.error) throw new BadRequestException(result.error);
    await this.auth.session(result.userId!, res);
    res.clearCookie(cookie, cookieOptions);
    return { ok: true };
  }

  async botCall(method: string, body: unknown, signal?: AbortSignal) {
    const response = await fetch(
      'https://api.telegram.org/bot' +
        process.env.TELEGRAM_BOT_TOKEN!.trim() +
        '/' +
        method,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(12000),
      },
    );
    const data = await response.json();
    if (!response.ok || !data.ok)
      throw new Error('Telegram API status ' + response.status);
    return data.result;
  }

  // Called only with authenticated getUpdates responses, never by an HTTP endpoint.
  async handleUpdate(update: any) {
    const m = update.message;
    if (
      m?.chat?.type !== 'private' ||
      m.from?.is_bot ||
      !Number.isSafeInteger(m.from?.id) ||
      m.from.id <= 0 ||
      m.chat.id !== m.from.id
    )
      return;
    const match =
      typeof m.text === 'string' &&
      /^\/start(?:@[a-zA-Z0-9_]+)? login_([a-zA-Z0-9_-]{43})$/.exec(m.text);
    if (!match) return;
    await this.db.transaction(async (db) => {
      const flow = (
        await db.query(
          'SELECT * FROM telegram_login_challenges WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',
          [digest(match[1])],
        )
      ).rows[0];
      if (!flow || flow.sent_at || flow.attempts >= 5) return;
      const id = String(m.from.id);
      const allowed = await db.query(
        "INSERT INTO telegram_login_throttle(telegram_id) VALUES($1) ON CONFLICT(telegram_id) DO UPDATE SET sent_at=now() WHERE telegram_login_throttle.sent_at<now()-interval '30 seconds' RETURNING telegram_id",
        [id],
      );
      if (!allowed.rows.length) return;
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      const text =
        flow.locale === 'en'
          ? 'Your Todo login code: ' +
            code +
            '\nValid for up to 5 minutes. Enter it only in the browser where you started login at ' +
            webUrl +
            '. Never share this code. If you did not request it, ignore this message.'
          : 'Todo ilovasiga kirish kodi: ' +
            code +
            '\nKo‘pi bilan 5 daqiqa amal qiladi. Faqat ' +
            webUrl +
            ' saytida kirishni boshlagan brauzeringizga kiriting. Kodni hech kimga bermang. Kirishni siz boshlamagan bo‘lsangiz, xabarni e’tiborsiz qoldiring.';
      await this.botCall('sendMessage', { chat_id: m.chat.id, text });
      await db.query(
        'UPDATE telegram_login_challenges SET telegram_id=$2,telegram_name=$3,code_hash=$4,sent_at=now() WHERE token_hash=$1',
        [
          flow.token_hash,
          id,
          [m.from.first_name, m.from.last_name]
            .filter(Boolean)
            .join(' ')
            .slice(0, 100) || 'Telegram user',
          digest(flow.token_hash + ':' + code),
        ],
      );
    });
  }

  onModuleInit() {
    if (
      !botConfigured() ||
      process.env.TELEGRAM_POLLING_ENABLED === 'false' ||
      process.env.NODE_ENV === 'test'
    )
      return;
    this.schedule(1000);
  }
  private schedule(ms: number) {
    if (!this.stopped)
      this.timer = setTimeout(() => {
        this.task = this.poll();
      }, ms);
  }
  private async poll() {
    let delay = 1000;
    try {
      const botId = process.env.TELEGRAM_BOT_TOKEN!.trim().split(':')[0];
      await this.db.transaction(async (db) => {
        // One active poller per bot even when two backend instances overlap.
        const lock = (
          await db.query(
            'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
            ['todo-bot:' + botId],
          )
        ).rows[0];
        if (!lock.acquired) return;
        await db.query(
          'INSERT INTO telegram_poll_offsets(bot_id) VALUES($1) ON CONFLICT DO NOTHING',
          [botId],
        );
        const row = (
          await db.query(
            'SELECT next_offset FROM telegram_poll_offsets WHERE bot_id=$1',
            [botId],
          )
        ).rows[0];
        this.abort = new AbortController();
        const updates = await this.botCall(
          'getUpdates',
          {
            offset: Number(row.next_offset),
            timeout: 20,
            allowed_updates: ['message'],
          },
          this.abort.signal,
        );
        for (const update of updates) {
          if (this.stopped) break;
          await this.handleUpdate(update);
          await db.query(
            'UPDATE telegram_poll_offsets SET next_offset=$2 WHERE bot_id=$1',
            [botId, update.update_id + 1],
          );
        }
        await db.query(
          "DELETE FROM telegram_login_throttle WHERE sent_at<now()-interval '1 day'",
        );
        await db.query(
          'DELETE FROM telegram_login_challenges WHERE expires_at<now()',
        );
      });
    } catch (error) {
      delay = 10000;
      if (!this.stopped)
        this.logger.warn(
          'Telegram polling unavailable. Check bot token, network and that no webhook or other bot process is active.',
        );
    } finally {
      this.schedule(delay);
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort?.abort();
    await this.task;
  }
}

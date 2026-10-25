import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { DatabaseService } from './database.service';
import { cookieOptions, isPro, sessionCookie, webUrl } from './config';

export const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const providers = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid email profile',
  },
};
type Provider = 'google' | 'telegram';
@Injectable()
export class AuthService {
  private keys = new Map<string, any>();
  constructor(private readonly db: DatabaseService) {}
  provider(name: string): Provider {
    if (name !== 'google' && name !== 'telegram')
      throw new BadRequestException('INVALID_PROVIDER');
    return name;
  }
  credentials(provider: Provider) {
    return {
      id: process.env[`${provider.toUpperCase()}_CLIENT_ID`] || '',
      secret: process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || '',
    };
  }
  available() {
    const c = this.credentials('google');
    return {
      google: !!c.id && !!c.secret,
      telegram:
        !!process.env.TELEGRAM_BOT_TOKEN?.trim() &&
        /^[a-zA-Z0-9_]{5,32}$/.test(
          (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, ''),
        ),
    };
  }
  async current(req: Request) {
    const token = req.cookies?.[sessionCookie];
    if (!token || typeof token !== 'string') return null;
    const { rows } = await this.db.query(
      'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [digest(token)],
    );
    return rows[0] || null;
  }
  async publicUser(user: any) {
    const { rows } = await this.db.query(
      'SELECT provider FROM identities WHERE user_id=$1',
      [user.id],
    );
    const avatar = (
      await this.db.query(
        'SELECT updated_at FROM user_avatars WHERE user_id=$1',
        [user.id],
      )
    ).rows[0];
    return {
      ...user,
      can_customize: user.role === 'admin' || isPro(user),
      avatar_url: avatar
        ? '/api/profile/avatar?v=' + new Date(avatar.updated_at).getTime()
        : null,
      is_pro: isPro(user),
      theme: user.role === 'admin' || isPro(user) ? user.theme : 'light',
      providers: rows.map((r: any) => r.provider),
      telegram_connected: !!user.telegram_chat_id,
    };
  }
  async session(userId: string, res: Response) {
    const token = random();
    await this.db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
      [digest(token), userId],
    );
    res.cookie(sessionCookie, token, {
      ...cookieOptions,
      maxAge: 30 * 86400000,
    });
  }
  async logout(req: Request, res: Response) {
    if (req.cookies?.[sessionCookie])
      await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [
        digest(req.cookies[sessionCookie]),
      ]);
    res.clearCookie(sessionCookie, cookieOptions);
    return { ok: true };
  }
  async start(name: string, link: boolean, req: Request, res: Response) {
    const provider = this.provider(name);
    if (provider === 'telegram') return res.redirect(webUrl);
    const creds = this.credentials(provider);
    if (!creds.id || !creds.secret)
      return res.redirect(`${webUrl}/?auth_error=PROVIDER_NOT_CONFIGURED`);
    const user = await this.current(req);
    if (link && !user) throw new UnauthorizedException('AUTH_REQUIRED');
    const state = random(),
      browser = random(),
      verifier = random(),
      nonce = random();
    await this.db.query(
      "INSERT INTO oauth_states(state_hash,browser_hash,provider,verifier,nonce,link_user_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')",
      [
        digest(state),
        digest(browser),
        provider,
        verifier,
        nonce,
        link ? user.id : null,
      ],
    );
    res.cookie(`todo_oauth_${provider}`, browser, {
      ...cookieOptions,
      maxAge: 600000,
    });
    const url = new URL(providers[provider].auth);
    url.search = new URLSearchParams({
      client_id: creds.id,
      redirect_uri: `${webUrl}/api/auth/${provider}/callback`,
      response_type: 'code',
      scope: providers[provider].scope,
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(provider === 'google' ? { prompt: 'select_account' } : {}),
    }).toString();
    return res.redirect(url.toString());
  }
  async callback(name: string, req: Request, res: Response) {
    const provider = this.provider(name);
    if (provider === 'telegram') return res.redirect(webUrl);
    const state = req.query.state,
      code = req.query.code;
    const browser = req.cookies?.[`todo_oauth_${provider}`];
    res.clearCookie(`todo_oauth_${provider}`, cookieOptions);
    try {
      if (typeof state !== 'string' || typeof browser !== 'string')
        throw new UnauthorizedException('INVALID_OAUTH_STATE');
      const { rows } = await this.db.query(
        'DELETE FROM oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND expires_at>now() RETURNING *',
        [digest(state), digest(browser), provider],
      );
      const flow = rows[0];
      if (!flow || typeof code !== 'string' || code.length > 4096)
        throw new UnauthorizedException('INVALID_OAUTH_STATE');
      if (
        flow.link_user_id &&
        (await this.current(req))?.id !== flow.link_user_id
      )
        throw new UnauthorizedException('AUTH_REQUIRED');
      const credentials = this.credentials(provider),
        p = providers[provider];
      const body = new URLSearchParams({
        code,
        client_id: credentials.id,
        redirect_uri: `${webUrl}/api/auth/${provider}/callback`,
        grant_type: 'authorization_code',
        code_verifier: flow.verifier,
      });
      if (provider === 'google') body.set('client_secret', credentials.secret);
      const response = await fetch(p.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new ServiceUnavailableException('OAUTH_FAILED');
      const tokens = await response.json();
      if (typeof tokens.id_token !== 'string')
        throw new UnauthorizedException('OAUTH_FAILED');
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      if (!this.keys.has(provider))
        this.keys.set(provider, createRemoteJWKSet(new URL(p.jwks)));
      const { payload } = await jwtVerify(
        tokens.id_token,
        this.keys.get(provider),
        {
          issuer: p.issuer,
          audience: credentials.id,
          algorithms: ['RS256'],
          requiredClaims: ['sub', 'exp', 'iat'],
        },
      );
      if (payload.azp !== undefined && payload.azp !== credentials.id)
        throw new UnauthorizedException('OAUTH_FAILED');
      if (
        (provider === 'google' || payload.nonce !== undefined) &&
        payload.nonce !== flow.nonce
      )
        throw new UnauthorizedException('OAUTH_FAILED');
      if (
        provider === 'google' &&
        (payload.email_verified !== true || typeof payload.email !== 'string')
      )
        throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
      const userId = await this.identity(provider, payload, flow.link_user_id);
      if (req.cookies?.[sessionCookie])
        await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [
          digest(req.cookies[sessionCookie]),
        ]);
      await this.session(userId, res);
      return res.redirect(
        `${webUrl}/?${flow.link_user_id ? 'linked=1' : 'signed_in=1'}`,
      );
    } catch (error) {
      const reason =
        error instanceof ConflictException
          ? 'IDENTITY_ALREADY_LINKED'
          : 'OAUTH_FAILED';
      return res.redirect(`${webUrl}/?auth_error=${reason}`);
    }
  }
  // Only reached after OAuth or bot-code proof plus an authenticated linking session.
  private async mergeAccounts(db: any, targetId: string, sourceId: string) {
    const users = (
      await db.query(
        'SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[targetId, sourceId]],
      )
    ).rows;
    const target = users.find((u: any) => u.id === targetId);
    const source = users.find((u: any) => u.id === sourceId);
    if (!target || !source) throw new UnauthorizedException('AUTH_REQUIRED');
    const conflict = (
      await db.query(
        'SELECT 1 FROM identities a JOIN identities b ON a.provider=b.provider WHERE a.user_id=$1 AND b.user_id=$2 AND a.subject<>b.subject',
        [targetId, sourceId],
      )
    ).rows.length;
    if (conflict) throw new ConflictException('IDENTITY_ALREADY_LINKED');
    await db.query(
      'UPDATE user_avatars SET user_id=$1 WHERE user_id=$2 AND NOT EXISTS(SELECT 1 FROM user_avatars WHERE user_id=$1)',
      [targetId, sourceId],
    );
    await db.query('UPDATE tasks SET user_id=$1 WHERE user_id=$2', [
      targetId,
      sourceId,
    ]);
    await db.query('UPDATE notifications SET user_id=$1 WHERE user_id=$2', [
      targetId,
      sourceId,
    ]);
    await db.query('UPDATE payments SET user_id=$1 WHERE user_id=$2', [
      targetId,
      sourceId,
    ]);
    await db.query('UPDATE payments SET reviewed_by=$1 WHERE reviewed_by=$2', [
      targetId,
      sourceId,
    ]);
    await db.query('UPDATE identities SET user_id=$1 WHERE user_id=$2', [
      targetId,
      sourceId,
    ]);
    // Release the unique Telegram ID before moving it onto the surviving user.
    await db.query('UPDATE users SET telegram_chat_id=NULL WHERE id=$1', [
      sourceId,
    ]);
    const now = Date.now();
    const remaining = [target.pro_until, source.pro_until].reduce(
      (sum: number, date: any) =>
        sum + (date ? Math.max(0, new Date(date).getTime() - now) : 0),
      0,
    );
    await db.query(
      'UPDATE users SET email=coalesce(email,$2),telegram_chat_id=coalesce(telegram_chat_id,$3),role=$4,pro_until=$5 WHERE id=$1',
      [
        targetId,
        source.email,
        source.telegram_chat_id,
        target.role === 'admin' || source.role === 'admin' ? 'admin' : 'user',
        remaining > 0
          ? new Date(now + remaining)
          : target.pro_until || source.pro_until,
      ],
    );
    // Previously issued sessions must not silently gain access to the combined data.
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [
      [targetId, sourceId],
    ]);
    await db.query('DELETE FROM users WHERE id=$1', [sourceId]);
  }
  async identity(
    provider: Provider,
    claims: any,
    linkId?: string,
    connection?: any,
  ) {
    const work = async (db: any) => {
      await db.query('SELECT pg_advisory_xact_lock(734214)');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        provider === 'telegram'
          ? `telegram:${claims.id}`
          : `${provider}:${claims.sub}`,
      ]);
      const found = (
        await db.query(
          "SELECT i.user_id,i.subject FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider=$1 AND (i.subject=$2 OR ($1='telegram' AND u.telegram_chat_id=$3))",
          [
            provider,
            claims.sub,
            provider === 'telegram' ? String(claims.id) : null,
          ],
        )
      ).rows[0];
      if (found && provider === 'telegram')
        claims = { ...claims, sub: found.subject };
      if (linkId && found && found.user_id !== linkId)
        await this.mergeAccounts(db, linkId, found.user_id);
      let id = linkId || found?.user_id;
      const email =
        provider === 'google' ? String(claims.email).toLowerCase() : null;
      const telegramId = provider === 'telegram' ? String(claims.id) : null;
      const admins = (process.env.ADMIN_EMAILS || '')
        .toLowerCase()
        .split(',')
        .map((s) => s.trim());
      const telegramAdmins = (process.env.ADMIN_TELEGRAM_IDS || '')
        .split(',')
        .map((s) => s.trim());
      const admin =
        (email && admins.includes(email)) ||
        (telegramId && telegramAdmins.includes(telegramId));
      if (!id) {
        id = (
          await db.query(
            'INSERT INTO users(name,email,role,telegram_chat_id) VALUES($1,$2,$3,$4) RETURNING id',
            [
              String(claims.name || claims.given_name || 'User').slice(0, 100),
              email,
              admin ? 'admin' : 'user',
              telegramId,
            ],
          )
        ).rows[0].id;
      }
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
      const existing = (
        await db.query(
          'SELECT subject FROM identities WHERE user_id=$1 AND provider=$2',
          [id, provider],
        )
      ).rows[0];
      if (existing && existing.subject !== claims.sub)
        throw new ConflictException('IDENTITY_ALREADY_LINKED');
      if (!found)
        await db.query(
          'INSERT INTO identities(provider,subject,user_id) VALUES($1,$2,$3)',
          [provider, claims.sub, id],
        );
      await db.query(
        "UPDATE users SET email=coalesce($2,email), telegram_chat_id=coalesce($3,telegram_chat_id), role=CASE WHEN $4 THEN 'admin' ELSE role END WHERE id=$1",
        [id, email, telegramId, !!admin],
      );
      return id;
    };
    return connection ? work(connection) : this.db.transaction(work);
  }
}

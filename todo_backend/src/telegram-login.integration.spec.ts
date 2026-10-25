import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { DatabaseService } from './database.service';
import { TelegramLoginService } from './telegram-login.service';
import { AuthService, digest } from './auth.service';
import { setupApp } from './setup-app';
import { webUrl, sessionCookie } from './config';
import { createTestDatabase, TestDatabase } from '../test/database';

describe('Telegram bot login', () => {
  let pg: TestDatabase,
    app: INestApplication,
    telegram: TelegramLoginService,
    auth: AuthService;
  let send: jest.SpyInstance;
  let telegramId = 700000;
  const req = () => request(app.getHttpServer());
  const post = (path: string, cookies = '') =>
    req()
      .post('/api/auth/telegram/' + path)
      .set('Origin', webUrl)
      .set('Cookie', cookies);
  const cookiesOf = (r: any, name: string) =>
    (r.headers['set-cookie'] as string[])
      .find((c) => c.startsWith(name + '='))!
      .split(';')[0];
  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = '12345:test';
    process.env.TELEGRAM_BOT_USERNAME = '@todosno1bot';
    process.env.TELEGRAM_POLLING_ENABLED = 'false';
    process.env.REMINDERS_ENABLED = 'false';
    pg = await createTestDatabase();
    for (const file of readdirSync(resolve(__dirname, '../db'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await pg.exec(readFileSync(resolve(__dirname, '../db', file), 'utf8'));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        query: (sql: string, p: any[]) => pg.query(sql, p),
        transaction: (fn: any) => pg.transaction(fn),
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    telegram = app.get(TelegramLoginService);
    auth = app.get(AuthService);
    send = jest.spyOn(telegram, 'botCall').mockResolvedValue({ message_id: 1 });
  }, 60000);
  afterAll(async () => {
    send?.mockRestore();
    await app?.close();
    await pg?.close();
  });
  async function begin(link = false, session = '') {
    const r = await post('begin', session)
      .send({ link, locale: 'uz' })
      .expect(201);
    expect(r.body.botUrl).toMatch(/^https:\/\/t.me\/todosno1bot\?start=login_/);
    const token = new URL(r.body.botUrl).searchParams.get('start')!.slice(6);
    return { cookie: cookiesOf(r, 'todo_telegram_login'), token };
  }
  function update(token: string, id = ++telegramId) {
    return {
      update_id: id,
      message: {
        chat: { id, type: 'private' },
        from: { id, is_bot: false, first_name: 'Test' },
        text: '/start login_' + token,
      },
    };
  }
  async function deliver(token: string, id?: number) {
    await telegram.handleUpdate(update(token, id));
    const body = send.mock.calls.at(-1)![1];
    return /kirish kodi: (\d{6})/.exec(body.text)![1];
  }
  async function session(id: string) {
    const token = 'session-' + id;
    await pg.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [digest(token), id],
    );
    return sessionCookie + '=' + token;
  }

  it('requires same-origin requests and validates code shape', async () => {
    await req().post('/api/auth/telegram/begin').send({}).expect(403);
    await post('verify').send({ code: '12' }).expect(400);
    await post('begin').send({ link: true }).expect(401);
  });
  it('delivers a hashed browser-bound code, creates a session, and rejects replay', async () => {
    const f = await begin();
    const code = await deliver(f.token);
    const row = (
      await pg.query<any>(
        'SELECT * FROM telegram_login_challenges WHERE token_hash=$1',
        [digest(f.token)],
      )
    ).rows[0];
    expect(row.code_hash).not.toContain(code);
    expect(row.code_hash).toBe(digest(digest(f.token) + ':' + code));
    await post('verify').send({ code }).expect(401);
    const other = await begin();
    await post('verify', other.cookie).send({ code }).expect(400);
    const r = await post('verify', f.cookie).send({ code }).expect(201);
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', cookiesOf(r, sessionCookie))
      .expect(200);
    expect(me.body.user.telegram_connected).toBe(true);
    expect(me.body.user.providers).toContain('telegram');
    await post('verify', f.cookie).send({ code }).expect(400);
  });
  it('locks after five wrong attempts, including when the correct code follows', async () => {
    const f = await begin();
    const code = await deliver(f.token);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await post('verify', f.cookie).send({ code: wrong }).expect(400);
    const r = await post('verify', f.cookie).send({ code }).expect(400);
    expect(r.body.message).toBe('TELEGRAM_CODE_LOCKED');
    expect(
      (
        await pg.query<any>(
          'SELECT attempts FROM telegram_login_challenges WHERE token_hash=$1',
          [digest(f.token)],
        )
      ).rows[0].attempts,
    ).toBe(5);
  });
  it('rejects expired codes and invalidates previous challenges on restart', async () => {
    const f = await begin();
    const code = await deliver(f.token);
    await pg.query(
      "UPDATE telegram_login_challenges SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [digest(f.token)],
    );
    expect(
      (await post('verify', f.cookie).send({ code }).expect(400)).body.message,
    ).toBe('TELEGRAM_CODE_EXPIRED');
    const fresh = await begin();
    await post('begin', fresh.cookie).send({}).expect(201);
    expect(
      (
        await pg.query(
          'SELECT * FROM telegram_login_challenges WHERE token_hash=$1',
          [digest(fresh.token)],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('ignores groups, forged chat IDs, duplicates and a second Telegram identity', async () => {
    const f = await begin();
    const m = update(f.token);
    const count = send.mock.calls.length;
    await telegram.handleUpdate({
      ...m,
      message: { ...m.message, chat: { ...m.message.chat, type: 'group' } },
    });
    await telegram.handleUpdate({
      ...m,
      message: { ...m.message, chat: { ...m.message.chat, id: 1 } },
    });
    expect(send.mock.calls.length).toBe(count);
    await telegram.handleUpdate(m);
    await telegram.handleUpdate(m);
    await telegram.handleUpdate(update(f.token));
    expect(send.mock.calls.length).toBe(count + 1);
  });
  it('rolls back failed delivery and permits a retry without storing plaintext', async () => {
    const f = await begin();
    const m = update(f.token);
    send.mockRejectedValueOnce(new Error('offline'));
    await expect(telegram.handleUpdate(m)).rejects.toThrow('offline');
    expect(
      (
        await pg.query<any>(
          'SELECT code_hash FROM telegram_login_challenges WHERE token_hash=$1',
          [digest(f.token)],
        )
      ).rows[0].code_hash,
    ).toBeNull();
    await telegram.handleUpdate(m);
    expect(
      (
        await pg.query<any>(
          'SELECT code_hash FROM telegram_login_challenges WHERE token_hash=$1',
          [digest(f.token)],
        )
      ).rows[0].code_hash,
    ).toBeTruthy();
  });
  it('preserves legacy OIDC users and their original subject', async () => {
    const id = ++telegramId;
    const owner = await auth.identity('telegram', {
      sub: 'old-oidc-subject',
      id,
      name: 'Existing',
    });
    const f = await begin();
    const code = await deliver(f.token, id);
    const r = await post('verify', f.cookie).send({ code }).expect(201);
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', cookiesOf(r, sessionCookie));
    expect(me.body.user.id).toBe(owner);
    expect(
      (
        await pg.query<any>('SELECT subject FROM identities WHERE user_id=$1', [
          owner,
        ])
      ).rows[0].subject,
    ).toBe('old-oidc-subject');
  });
  it('links to the authenticated Google account and refuses changed sessions', async () => {
    const owner = await auth.identity('google', {
      sub: 'link-google',
      email: 'link@example.test',
      name: 'Google',
    });
    const sc = await session(owner);
    const f = await begin(true, sc);
    const code = await deliver(f.token);
    expect(
      (await post('verify', f.cookie).send({ code }).expect(400)).body.message,
    ).toBe('AUTH_REQUIRED');
    const r = await post('verify', f.cookie + '; ' + sc)
      .send({ code })
      .expect(201);
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', cookiesOf(r, sessionCookie));
    expect(me.body.user.id).toBe(owner);
    expect(me.body.user.providers.sort()).toEqual(['google', 'telegram']);
  });
  it('refuses linking a Telegram identity already owned by another account', async () => {
    const id = ++telegramId;
    const sourceOwner = await auth.identity('telegram', {
      sub: 'bot:' + id,
      id,
      name: 'Owner',
    });
    await auth.identity(
      'google',
      { sub: 'source-google-conflict', email: 'source@example.test' },
      sourceOwner,
    );
    const owner = await auth.identity('google', {
      sub: 'conflict-google',
      email: 'conflict@example.test',
      name: 'Other',
    });
    const sc = await session(owner);
    const f = await begin(true, sc);
    const code = await deliver(f.token, id);
    const r = await post('verify', f.cookie + '; ' + sc)
      .send({ code })
      .expect(409);
    expect(r.body.message).toBe('IDENTITY_ALREADY_LINKED');
    expect(
      (
        await pg.query<any>('SELECT telegram_chat_id FROM users WHERE id=$1', [
          owner,
        ])
      ).rows[0].telegram_chat_id,
    ).toBeNull();
  });
  it('merges an existing Telegram account after code proof and retains both task lists', async () => {
    const id = ++telegramId;
    const source = await auth.identity('telegram', {
      sub: 'bot:' + id,
      id,
      name: 'Telegram',
    });
    const target = await auth.identity('google', {
      sub: 'merge-via-code',
      email: 'merge-code@example.test',
      name: 'Google',
    });
    for (const userId of [source, target])
      await pg.query("INSERT INTO tasks(user_id,title) VALUES($1,'Retained')", [
        userId,
      ]);
    const sc = await session(target);
    const f = await begin(true, sc);
    const code = await deliver(f.token, id);
    const r = await post('verify', f.cookie + '; ' + sc)
      .send({ code })
      .expect(201);
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', cookiesOf(r, sessionCookie));
    expect(me.body.user.id).toBe(target);
    expect(me.body.user.providers.sort()).toEqual(['google', 'telegram']);
    expect(
      (await pg.query('SELECT * FROM tasks WHERE user_id=$1', [target])).rows,
    ).toHaveLength(2);
  });
  it('allows only one concurrent redemption', async () => {
    const f = await begin();
    const code = await deliver(f.token);
    const results = await Promise.all([
      post('verify', f.cookie).send({ code }),
      post('verify', f.cookie).send({ code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  });
  it('throttles repeated bot sends for the same Telegram user', async () => {
    const id = ++telegramId;
    const one = await begin();
    await deliver(one.token, id);
    const count = send.mock.calls.length;
    const two = await begin();
    await telegram.handleUpdate(update(two.token, id));
    expect(send.mock.calls.length).toBe(count);
  });
});

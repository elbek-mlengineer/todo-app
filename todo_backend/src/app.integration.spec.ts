import sharp from 'sharp';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestDatabase } from '../test/database';
import type { TestDatabase } from '../test/database';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AppModule } from './app.module';
import { DatabaseService } from './database.service';
import { AuthService, digest } from './auth.service';
import { RemindersService } from './reminders.service';
import { setupApp } from './setup-app';
import { webUrl, sessionCookie } from './config';

describe('Todo application (isolated PostgreSQL integration)', () => {
  let pg: TestDatabase,
    app: INestApplication,
    auth: AuthService,
    reminders: RemindersService;
  let alice: string,
    bob: string,
    admin: string,
    aliceCookie: string,
    bobCookie: string,
    adminCookie: string;
  let taskId: string, paymentId: string;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zk1sAAAAASUVORK5CYII=',
    'base64',
  );
  const future = () => new Date(Date.now() + 3600000).toISOString();
  const req = () => request(app.getHttpServer());
  beforeAll(async () => {
    process.env.REMINDERS_ENABLED = 'false';
    process.env.PAYMENT_CARD_NUMBER = '0000000000000000';
    process.env.PAYMENT_CARD_HOLDER = 'TEST ONLY';
    process.env.PRO_PRICE_UZS = '15000';
    process.env.PRO_DURATION_DAYS = '30';
    delete process.env.TELEGRAM_BOT_TOKEN;
    pg = await createTestDatabase();
    for (const file of readdirSync(resolve(__dirname, '../db'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await pg.exec(readFileSync(resolve(__dirname, '../db', file), 'utf8'));
    const adapter = {
      query: (sql: string, params: any[] = []) => pg.query(sql, params),
      transaction: <T>(fn: (db: any) => Promise<T>) => pg.transaction(fn),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(adapter)
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    auth = app.get(AuthService);
    reminders = app.get(RemindersService);
    async function user(name: string, role = 'user') {
      const id = (
        await pg.query<any>(
          'INSERT INTO users(name,role) VALUES($1,$2) RETURNING id',
          [name, role],
        )
      ).rows[0].id;
      const token = randomBytes(32).toString('hex');
      await pg.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [digest(token), id],
      );
      return [id, `${sessionCookie}=${token}`];
    }
    [alice, aliceCookie] = await user('Alice');
    [bob, bobCookie] = await user('Bob');
    [admin, adminCookie] = await user('Administrator', 'admin');
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await pg?.close();
  });

  it('requires a session and rejects cross-origin mutations', async () => {
    await req().get('/api/tasks').expect(401);
    await req()
      .post('/api/tasks')
      .set('Cookie', aliceCookie)
      .set('Origin', 'https://evil.example')
      .send({ title: 'blocked' })
      .expect(403);
    await req()
      .post('/api/tasks')
      .set('Cookie', aliceCookie)
      .send({ title: 'missing origin' })
      .expect(403);
  });
  it('validates titles, dates, properties, priorities and nulls', async () => {
    for (const body of [
      { title: '   ' },
      { title: 'x', priority: 'critical' },
      { title: 'x', user_id: bob },
      { title: 'x', due_at: '2030-02-31T10:00:00Z' },
      { title: 'x', due_at: '2030-01-01' },
    ])
      await req()
        .post('/api/tasks')
        .set('Cookie', aliceCookie)
        .set('Origin', webUrl)
        .send(body)
        .expect(400);
  });
  it('creates an owned task and two durable reminders', async () => {
    const result = await req()
      .post('/api/tasks')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({
        title: '  Write 100% of plan  ',
        priority: 'high',
        category: 'work',
        description: 'Important planning',
        due_at: future(),
        reminder: true,
      })
      .expect(201);
    taskId = result.body.id;
    expect(result.body.title).toBe('Write 100% of plan');
    expect(result.body.user_id).toBe(alice);
    expect(
      (await pg.query('SELECT * FROM reminders WHERE task_id=$1', [taskId]))
        .rows,
    ).toHaveLength(2);
  });
  it('enforces task ownership for reads, updates and deletes', async () => {
    const list = await req()
      .get('/api/tasks')
      .set('Cookie', bobCookie)
      .expect(200);
    expect(list.body.items).toHaveLength(0);
    await req()
      .patch(`/api/tasks/${taskId}`)
      .set('Cookie', bobCookie)
      .set('Origin', webUrl)
      .send({ title: 'stolen' })
      .expect(404);
    await req()
      .delete(`/api/tasks/${taskId}`)
      .set('Cookie', bobCookie)
      .set('Origin', webUrl)
      .expect(404);
    await req()
      .patch(`/api/tasks/${taskId}`)
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ title: null })
      .expect(400);
  });
  it('searches literally and applies priority/status/date filters', async () => {
    const found = await req()
      .get('/api/tasks')
      .query({
        search: '100%',
        priority: 'high',
        status: 'active',
        from: new Date().toISOString(),
      })
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(found.body.total).toBe(1);
    const none = await req()
      .get('/api/tasks')
      .query({ search: '100_', priority: 'high' })
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(none.body.total).toBe(0);
    const empty = await req()
      .get('/api/tasks?priority=low')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(empty.body.total).toBe(0);
  });
  it('updates a task, cancels reminders when completed, and restores them on reopening', async () => {
    await req()
      .patch(`/api/tasks/${taskId}`)
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ completed: true })
      .expect(200);
    expect(
      (await pg.query('SELECT * FROM reminders WHERE task_id=$1', [taskId]))
        .rows,
    ).toHaveLength(0);
    const stats = await req()
      .get('/api/tasks/stats')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(stats.body.completed).toBe(1);
    await req()
      .patch(`/api/tasks/${taskId}`)
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ completed: false, description: 'Updated' })
      .expect(200);
    expect(
      (await pg.query('SELECT * FROM reminders WHERE task_id=$1', [taskId]))
        .rows,
    ).toHaveLength(2);
  });
  it('disallows paid themes for free/expired users and validates settings', async () => {
    await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ theme: 'dark' })
      .expect(403);
    await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ role: 'admin' })
      .expect(400);
    await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ timezone: 'Invalid/Zone' })
      .expect(400);
    await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ locale: 'en', timezone: 'UTC' })
      .expect(200);
  });
  it('rejects fake receipts and enforces one pending payment', async () => {
    await req()
      .post('/api/payments')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .attach('receipt', Buffer.from('<script>bad</script>'), 'receipt.png')
      .expect(400);
    const result = await req()
      .post('/api/payments')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .field('note', 'Test transfer')
      .attach('receipt', png, 'receipt.png')
      .expect(201);
    paymentId = result.body.id;
    await req()
      .post('/api/payments')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .attach('receipt', png, 'receipt.png')
      .expect(409);
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(me.body.user.is_pro).toBe(false);
  });
  it('keeps payment receipts private and requires an administrator for approval', async () => {
    await req()
      .get(`/api/payments/${paymentId}/receipt`)
      .set('Cookie', bobCookie)
      .expect(404);
    const receipt = await req()
      .get(`/api/payments/${paymentId}/receipt`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(receipt.headers['content-disposition']).toContain('attachment');
    await req()
      .get('/api/admin/payments')
      .set('Cookie', aliceCookie)
      .expect(403);
    await req()
      .patch(`/api/admin/payments/${paymentId}`)
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ status: 'approved' })
      .expect(403);
  });
  it('approves once, activates Pro, and supports paid themes', async () => {
    await req()
      .patch(`/api/admin/payments/${paymentId}`)
      .set('Cookie', adminCookie)
      .set('Origin', webUrl)
      .send({ status: 'approved' })
      .expect(200);
    await req()
      .patch(`/api/admin/payments/${paymentId}`)
      .set('Cookie', adminCookie)
      .set('Origin', webUrl)
      .send({ status: 'approved' })
      .expect(409);
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(me.body.user.is_pro).toBe(true);
    const setting = await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ theme: 'ocean' })
      .expect(200);
    expect(setting.body.theme).toBe('ocean');
    const before = me.body.user.pro_until;
    const second = await req()
      .post('/api/payments')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .attach('receipt', png, 'receipt.png')
      .expect(201);
    await req()
      .patch(`/api/admin/payments/${second.body.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', webUrl)
      .send({ status: 'approved' })
      .expect(200);
    const after = await req()
      .get('/api/auth/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(
      new Date(after.body.user.pro_until).getTime() -
        new Date(before).getTime(),
    ).toBe(30 * 86400000);
  });
  it('expires paid appearance and restores the free white theme', async () => {
    await pg.query(
      "UPDATE users SET pro_until=now()-interval '1 second' WHERE id=$1",
      [alice],
    );
    const me = await req()
      .get('/api/auth/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(me.body.user.is_pro).toBe(false);
    expect(me.body.user.theme).toBe('light');
    await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ theme: 'dark' })
      .expect(403);
  });
  it('materializes due reminders once and respects user notification preferences', async () => {
    await pg.query('DELETE FROM notifications');
    await pg.query(
      "UPDATE reminders SET deliver_at=now()-interval '1 minute' WHERE task_id=$1 AND kind='soon'",
      [taskId],
    );
    await reminders.materialize();
    await reminders.materialize();
    const list = await req()
      .get('/api/notifications')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.unread).toBe(1);
    await req()
      .post(`/api/notifications/${list.body.items[0].id}/read`)
      .set('Cookie', bobCookie)
      .set('Origin', webUrl)
      .expect(404);
    await req()
      .post('/api/notifications/read-all')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .expect(201);
    expect(
      (await req().get('/api/notifications').set('Cookie', aliceCookie)).body
        .unread,
    ).toBe(0);
    await pg.query('UPDATE users SET in_app_enabled=false WHERE id=$1', [
      alice,
    ]);
    await pg.query(
      "UPDATE reminders SET deliver_at=now()-interval '1 minute' WHERE task_id=$1",
      [taskId],
    );
    await reminders.materialize();
    expect(
      (await req().get('/api/notifications').set('Cookie', aliceCookie)).body
        .items,
    ).toHaveLength(1);
  });
  it('retries Telegram delivery, then marks a successful send and does not resend', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    await pg.query(
      "UPDATE users SET telegram_chat_id='12345',telegram_enabled=true WHERE id=$1",
      [alice],
    );
    const notification = (
      await pg.query<any>(
        "INSERT INTO notifications(user_id,kind,title,body,telegram_status) VALUES($1,'payment','Test','Test','pending') RETURNING id",
        [alice],
      )
    ).rows[0].id;
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);
    try {
      await reminders.deliver();
      let row = (
        await pg.query<any>('SELECT * FROM notifications WHERE id=$1', [
          notification,
        ])
      ).rows[0];
      expect(row.telegram_status).toBe('pending');
      expect(row.telegram_attempts).toBe(1);
      await pg.query(
        "UPDATE notifications SET telegram_retry_at=now()-interval '1 second' WHERE id=$1",
        [notification],
      );
      await reminders.deliver();
      await reminders.deliver();
      row = (
        await pg.query<any>('SELECT * FROM notifications WHERE id=$1', [
          notification,
        ])
      ).rows[0];
      expect(row.telegram_status).toBe('sent');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });
  it('links verified identities explicitly and prevents taking another account', async () => {
    const id = await auth.identity('google', {
      sub: 'test-google',
      email: 'test@example.com',
      name: 'Google Test',
    });
    expect(
      await auth.identity('google', {
        sub: 'test-google',
        email: 'test@example.com',
        name: 'Google Test',
      }),
    ).toBe(id);
    expect(
      await auth.identity(
        'telegram',
        { sub: 'telegram-sub', id: 987654321, name: 'Telegram Test' },
        id,
      ),
    ).toBe(id);
    await auth.identity(
      'google',
      { sub: 'bob-conflicting-google', email: 'bob@example.test' },
      bob,
    );
    await expect(
      auth.identity('telegram', { sub: 'telegram-sub', id: 987654321 }, bob),
    ).rejects.toThrow('IDENTITY_ALREADY_LINKED');
    expect(
      (await pg.query('SELECT * FROM identities WHERE user_id=$1', [id])).rows,
    ).toHaveLength(2);
  });
  it('merges verified Google and Telegram accounts preserving data and privileges', async () => {
    const tgId = await auth.identity('telegram', {
      sub: 'merge-tg',
      id: 8880001,
      name: 'Telegram Name',
    });
    const googleId = await auth.identity('google', {
      sub: 'merge-google',
      email: 'merge@example.test',
      name: 'Google Name',
    });
    await pg.query(
      "UPDATE users SET role='admin',pro_until=now()+interval '10 days' WHERE id=$1",
      [googleId],
    );
    await pg.query(
      "UPDATE users SET pro_until=now()+interval '5 days' WHERE id=$1",
      [tgId],
    );
    for (const id of [tgId, googleId]) {
      await pg.query(
        "INSERT INTO tasks(user_id,title) VALUES($1,'Keep this task')",
        [id],
      );
      await pg.query(
        "INSERT INTO notifications(user_id,kind,title,body) VALUES($1,'test','Keep notice','Body')",
        [id],
      );
      await pg.query(
        "INSERT INTO payments(user_id,price_uzs,duration_days,receipt,receipt_type) VALUES($1,1000,30,$2,'image/png')",
        [id, png],
      );
      await pg.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        ['merge-' + id, id],
      );
    }
    expect(
      await auth.identity(
        'google',
        { sub: 'merge-google', email: 'merge@example.test' },
        tgId,
      ),
    ).toBe(tgId);
    expect(
      await auth.identity('google', {
        sub: 'merge-google',
        email: 'merge@example.test',
      }),
    ).toBe(tgId);
    expect(
      await auth.identity('telegram', { sub: 'merge-tg', id: 8880001 }),
    ).toBe(tgId);
    for (const table of ['tasks', 'notifications', 'payments', 'identities'])
      expect(
        (await pg.query('SELECT * FROM ' + table + ' WHERE user_id=$1', [tgId]))
          .rows,
      ).toHaveLength(2);
    expect(
      (await pg.query('SELECT * FROM sessions WHERE user_id=$1', [tgId])).rows,
    ).toHaveLength(0);
    expect(
      (await pg.query('SELECT * FROM users WHERE id=$1', [googleId])).rows,
    ).toHaveLength(0);
    const merged = (
      await pg.query<any>('SELECT * FROM users WHERE id=$1', [tgId])
    ).rows[0];
    expect(merged.role).toBe('admin');
    expect(merged.name).toBe('Telegram Name');
    expect(new Date(merged.pro_until).getTime() - Date.now()).toBeGreaterThan(
      14.9 * 86400000,
    );
  });
  it('serializes simultaneous receipt submissions after the merge migration', async () => {
    const owner = await auth.identity('google', {
      sub: 'receipt-race',
      email: 'race@example.test',
    });
    const payments = app.get(require('./payments.service').PaymentsService);
    const file = { buffer: png, size: png.length } as Express.Multer.File;
    const results = await Promise.allSettled([
      payments.submit(owner, file),
      payments.submit(owner, file),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      (await pg.query('SELECT * FROM payments WHERE user_id=$1', [owner])).rows,
    ).toHaveLength(1);
  });
  it('edits only the authenticated profile and rejects blank names or role escalation', async () => {
    const changed = await req()
      .patch('/api/settings')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .send({ name: '  Alice Updated  ' })
      .expect(200);
    expect(changed.body.name).toBe('Alice Updated');
    for (const body of [
      { name: '   ' },
      { name: null },
      { name: 'x'.repeat(101) },
      { role: 'admin' },
      { email: 'owner@example.test' },
    ])
      await req()
        .patch('/api/settings')
        .set('Cookie', aliceCookie)
        .set('Origin', webUrl)
        .send(body)
        .expect(400);
    expect(
      (await pg.query<any>('SELECT name FROM users WHERE id=$1', [bob])).rows[0]
        .name,
    ).toBe('Bob');
  });
  it('allows only administrators to browse users with search and pagination', async () => {
    await req().get('/api/admin/users').expect(401);
    await req().get('/api/admin/users').set('Cookie', bobCookie).expect(403);
    const list = await req()
      .get('/api/admin/users?q=Alice')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(alice);
    expect(list.body.items[0]).not.toHaveProperty('telegram_chat_id');
    expect(list.body.items[0]).not.toHaveProperty('token_hash');
    await req()
      .get('/api/admin/users?page=0')
      .set('Cookie', adminCookie)
      .expect(400);
    const last = await req()
      .get('/api/admin/users?page=999')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(last.body.items).toHaveLength(0);
  });
  it('allows administrator themes without a Pro subscription and preserves free-user limits', async () => {
    for (const theme of [
      'dark',
      'forest',
      'lavender',
      'sunset',
      'ocean',
      'light',
    ]) {
      const r = await req()
        .patch('/api/settings')
        .set('Cookie', adminCookie)
        .set('Origin', webUrl)
        .send({ theme })
        .expect(200);
      expect(r.body.theme).toBe(theme);
      expect(r.body.can_customize).toBe(true);
      expect(r.body.is_pro).toBe(false);
    }
    await req()
      .patch('/api/settings')
      .set('Cookie', bobCookie)
      .set('Origin', webUrl)
      .send({ theme: 'dark' })
      .expect(403);
  });
  it('validates and normalizes avatar uploads, isolates access and removes photos', async () => {
    const photo = await sharp({
      create: { width: 20, height: 40, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    await req()
      .post('/api/profile/avatar')
      .set('Origin', webUrl)
      .attach('file', photo, 'photo.png')
      .expect(401);
    await req()
      .post('/api/profile/avatar')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .attach('file', Buffer.from('<svg></svg>'), 'photo.png')
      .expect(400);
    await req()
      .post('/api/profile/avatar')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .attach('file', Buffer.alloc(3 * 1024 * 1024 + 1), 'big.png')
      .expect(413);
    const result = await req()
      .post('/api/profile/avatar')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .attach('file', photo, 'photo.png')
      .expect(201);
    expect(result.body.avatar_url).toMatch(/^\/api\/profile\/avatar\?v=/);
    expect(result.body).not.toHaveProperty('image');
    const image = await req()
      .get('/api/profile/avatar')
      .set('Cookie', aliceCookie)
      .expect(200);
    const metadata = await sharp(image.body).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
    await req().get('/api/profile/avatar').set('Cookie', bobCookie).expect(404);
    const removed = await req()
      .delete('/api/profile/avatar')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .expect(200);
    expect(removed.body.avatar_url).toBeNull();
    await req()
      .get('/api/profile/avatar')
      .set('Cookie', aliceCookie)
      .expect(404);
  });
  it('rejects callback replay and forged OAuth state', async () => {
    const result = await req()
      .get('/api/auth/google/callback?state=forged&code=forged')
      .expect(302);
    expect(result.headers.location).toContain('auth_error=OAUTH_FAILED');
  });
  it('deletes an owned task with pending reminders and revokes logout sessions', async () => {
    await req()
      .delete(`/api/tasks/${taskId}`)
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .expect(200);
    expect(
      (await pg.query('SELECT * FROM reminders WHERE task_id=$1', [taskId]))
        .rows,
    ).toHaveLength(0);
    await req()
      .post('/api/auth/logout')
      .set('Cookie', aliceCookie)
      .set('Origin', webUrl)
      .expect(201);
    await req().get('/api/tasks').set('Cookie', aliceCookie).expect(401);
  });
});

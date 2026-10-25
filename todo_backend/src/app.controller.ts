import sharp from 'sharp';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DatabaseService } from './database.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TasksService } from './tasks.service';
import { PaymentsService } from './payments.service';
import {
  PaymentDto,
  ReviewDto,
  SettingsDto,
  TaskDto,
  TaskQueryDto,
  UpdateTaskDto,
} from './dto';
import { isPro } from './config';

@Controller('api')
@UseGuards(AuthGuard)
export class AppController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly tasks: TasksService,
    private readonly payments: PaymentsService,
  ) {}
  @Get('tasks') list(@Req() req: any, @Query() query: TaskQueryDto) {
    return this.tasks.list(req.user.id, query);
  }
  @Get('tasks/stats') stats(@Req() req: any) {
    return this.tasks.stats(req.user.id);
  }
  @Post('tasks') create(@Req() req: any, @Body() dto: TaskDto) {
    return this.tasks.create(req.user.id, dto);
  }
  @Patch('tasks/:id') update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(req.user.id, id, dto);
  }
  @Delete('tasks/:id') remove(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(req.user.id, id);
  }
  @Patch('settings') async settings(@Req() req: any, @Body() dto: SettingsDto) {
    if (
      dto.theme &&
      dto.theme !== 'light' &&
      req.user.role !== 'admin' &&
      !isPro(req.user)
    )
      throw new ForbiddenException('PRO_REQUIRED');
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format();
      } catch {
        throw new BadRequestException('INVALID_TIMEZONE');
      }
    }
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    let user = req.user;
    if (entries.length)
      user = (
        await this.db.query(
          `UPDATE users SET ${entries.map(([k], i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`,
          [req.user.id, ...entries.map(([, v]) => v)],
        )
      ).rows[0];
    return this.auth.publicUser(user);
  }
  @Post('profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async uploadAvatar(
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException('INVALID_AVATAR');
    let image: Buffer;
    try {
      const source = sharp(file.buffer, {
        limitInputPixels: 16000000,
        animated: false,
      });
      const metadata = await source.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format || '') ||
        (metadata.pages || 1) > 1
      )
        throw new Error('Unsupported image');
      image = await source
        .rotate()
        .resize(256, 256, { fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('INVALID_AVATAR');
    }
    await this.db.query(
      'INSERT INTO user_avatars(user_id,image) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET image=excluded.image,updated_at=clock_timestamp()',
      [req.user.id, image],
    );
    return this.auth.publicUser(req.user);
  }
  @Get('profile/avatar') async avatar(@Req() req: any, @Res() res: Response) {
    const row = (
      await this.db.query('SELECT image FROM user_avatars WHERE user_id=$1', [
        req.user.id,
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('NOT_FOUND');
    res
      .set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(row.image);
  }
  @Delete('profile/avatar') async deleteAvatar(@Req() req: any) {
    await this.db.query('DELETE FROM user_avatars WHERE user_id=$1', [
      req.user.id,
    ]);
    return this.auth.publicUser(req.user);
  }
  @Get('admin/users') async adminUsers(
    @Req() req: any,
    @Query('q') q: unknown,
    @Query('page') rawPage: unknown,
  ) {
    this.payments.admin(req.user);
    if (q !== undefined && (typeof q !== 'string' || q.length > 100))
      throw new BadRequestException('INVALID_INPUT');
    const page = rawPage === undefined ? 1 : Number(rawPage);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new BadRequestException('INVALID_INPUT');
    const term = String(q || '').trim();
    const where =
      "($1='' OR strpos(lower(u.name),lower($1))>0 OR strpos(lower(coalesce(u.email,'')),lower($1))>0)";
    const total = Number(
      (
        await this.db.query('SELECT count(*) FROM users u WHERE ' + where, [
          term,
        ])
      ).rows[0].count,
    );
    const items = (
      await this.db.query(
        'SELECT u.id,u.name,u.email,u.role,u.pro_until,u.created_at, ARRAY(SELECT provider FROM identities WHERE user_id=u.id ORDER BY provider) AS providers,(SELECT count(*)::int FROM tasks WHERE user_id=u.id) AS task_count FROM users u WHERE ' +
          where +
          ' ORDER BY u.created_at DESC,u.id LIMIT 20 OFFSET $2',
        [term, (page - 1) * 20],
      )
    ).rows;
    return {
      items: items.map((u: any) => ({ ...u, is_pro: isPro(u) })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
    };
  }
  @Get('notifications') async notifications(@Req() req: any) {
    const items = (
      await this.db.query(
        'SELECT id,task_id,kind,title,body,read_at,created_at,telegram_status FROM notifications WHERE user_id=$1 AND visible ORDER BY created_at DESC LIMIT 100',
        [req.user.id],
      )
    ).rows;
    const unread = Number(
      (
        await this.db.query(
          'SELECT count(*) FROM notifications WHERE user_id=$1 AND visible AND read_at IS NULL',
          [req.user.id],
        )
      ).rows[0].count,
    );
    return { items, unread };
  }
  @Post('notifications/read-all') async readAll(@Req() req: any) {
    await this.db.query(
      'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND visible AND read_at IS NULL',
      [req.user.id],
    );
    return { ok: true };
  }
  @Post('notifications/:id/read') async read(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.db.query(
      'UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 AND visible RETURNING id',
      [id, req.user.id],
    );
    if (!result.rows.length) throw new NotFoundException('NOT_FOUND');
    return { ok: true };
  }
  @Get('payments') history(@Req() req: any) {
    return this.payments.list(req.user);
  }
  @Post('payments')
  @UseInterceptors(
    FileInterceptor('receipt', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  submit(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PaymentDto,
  ) {
    return this.payments.submit(req.user.id, file, dto.note);
  }
  @Get('payments/:id/receipt') async receipt(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const data = await this.payments.receipt(req.user, id);
    const ext = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    }[data.receipt_type];
    res.set({
      'Content-Type': data.receipt_type,
      'Content-Disposition': `attachment; filename="receipt-${id}.${ext}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(data.receipt);
  }
  @Get('admin/payments') adminList(@Req() req: any) {
    return this.payments.adminList(req.user);
  }
  @Patch('admin/payments/:id') review(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.payments.review(req.user, id, dto);
  }
}
@Controller('api/health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Get() async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok' };
  }
}

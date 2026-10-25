import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from './database.service';
import { paymentConfig } from './config';
import { ReviewDto } from './dto';
const columns =
  'p.id,p.user_id,p.status,p.price_uzs,p.duration_days,p.note,p.review_note,p.reviewed_at,p.created_at';
export function receiptType(data: Buffer): string | null {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255)
    return 'image/jpeg';
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (data.length >= 5 && data.toString('ascii', 0, 5) === '%PDF-')
    return 'application/pdf';
  return null;
}
@Injectable()
export class PaymentsService {
  constructor(private readonly db: DatabaseService) {}
  async submit(
    userId: string,
    file: Express.Multer.File | undefined,
    note = '',
  ) {
    const config = paymentConfig();
    if (!config.enabled)
      throw new ServiceUnavailableException('PAYMENTS_NOT_CONFIGURED');
    if (!file || file.size > 5 * 1024 * 1024)
      throw new BadRequestException('INVALID_RECEIPT');
    const mime = receiptType(file.buffer);
    if (!mime) throw new BadRequestException('INVALID_RECEIPT');
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (
        (
          await db.query(
            "SELECT 1 FROM payments WHERE user_id=$1 AND status='pending'",
            [userId],
          )
        ).rows.length
      )
        throw new ConflictException('PAYMENT_PENDING');
      return (
        await db.query(
          'INSERT INTO payments(user_id,price_uzs,duration_days,receipt,receipt_type,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at',
          [userId, config.price, config.days, file.buffer, mime, note],
        )
      ).rows[0];
    });
  }

  async list(user: any) {
    const { rows } = await this.db.query(
      `SELECT ${columns} FROM payments p WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 100`,
      [user.id],
    );
    return rows;
  }
  admin(user: any) {
    if (user.role !== 'admin') throw new ForbiddenException('ADMIN_REQUIRED');
  }
  async adminList(user: any) {
    this.admin(user);
    return (
      await this.db.query(
        `SELECT ${columns},u.name,u.email FROM payments p JOIN users u ON u.id=p.user_id ORDER BY (p.status='pending') DESC,p.created_at DESC LIMIT 200`,
      )
    ).rows;
  }
  async receipt(user: any, id: string) {
    const item = (
      await this.db.query(
        'SELECT user_id,receipt,receipt_type FROM payments WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!item || (user.role !== 'admin' && item.user_id !== user.id))
      throw new NotFoundException('NOT_FOUND');
    return item;
  }
  async review(user: any, id: string, dto: ReviewDto) {
    this.admin(user);
    return this.db.transaction(async (db) => {
      const item = (
        await db.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!item) throw new NotFoundException('NOT_FOUND');
      if (item.status !== 'pending')
        throw new ConflictException('PAYMENT_ALREADY_REVIEWED');
      const owner = (
        await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [
          item.user_id,
        ])
      ).rows[0];
      if (dto.status === 'approved')
        await db.query(
          "UPDATE users SET pro_until=greatest(coalesce(pro_until,now()),now()) + ($2 * interval '1 day') WHERE id=$1",
          [item.user_id, item.duration_days],
        );
      await db.query(
        'UPDATE payments SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1',
        [id, dto.status, dto.note || '', user.id],
      );
      const uz = owner.locale === 'uz',
        approved = dto.status === 'approved';
      await db.query(
        "INSERT INTO notifications(user_id,kind,title,body,visible,telegram_status) VALUES($1,'payment',$2,$3,true,$4)",
        [
          item.user_id,
          uz
            ? approved
              ? 'Pro faollashtirildi!'
              : 'Chek tasdiqlanmadi'
            : approved
              ? 'Pro is now active!'
              : 'Receipt not approved',
          dto.note ||
            (uz
              ? approved
                ? `${item.duration_days} kunlik Pro hisobingizga qo‘shildi.`
                : 'To‘lovni tekshirib, yangi chek yuboring.'
              : approved
                ? `${item.duration_days} days of Pro were added to your account.`
                : 'Check your payment and submit a new receipt.'),
          owner.telegram_chat_id && owner.telegram_enabled ? 'pending' : 'skip',
        ],
      );
      return { ok: true };
    });
  }
}

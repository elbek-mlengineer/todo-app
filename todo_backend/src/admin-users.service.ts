import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AdminUserDto } from './dto';
@Injectable()
export class AdminUsersService {
  constructor(private readonly db: DatabaseService) {}
  private async authorize(db: any, actorId: string, targetId: string) {
    // Serialize against account linking/merging and other admin user mutations.
    await db.query('SELECT pg_advisory_xact_lock(734214)');
    const actor = (
      await db.query('SELECT role FROM users WHERE id=$1 FOR UPDATE', [actorId])
    ).rows[0];
    if (actor?.role !== 'admin') throw new ForbiddenException('ADMIN_REQUIRED');
    const target = (
      await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [targetId])
    ).rows[0];
    if (!target) throw new NotFoundException('USER_NOT_FOUND');
    return target;
  }
  async update(actorId: string, targetId: string, dto: AdminUserDto) {
    if (dto.name === undefined && dto.pro_days === undefined)
      throw new BadRequestException('INVALID_INPUT');
    return this.db.transaction(async (db) => {
      const target = await this.authorize(db, actorId, targetId);
      const changes: any = {};
      if (dto.name !== undefined) {
        await db.query('UPDATE users SET name=$2 WHERE id=$1', [
          targetId,
          dto.name,
        ]);
        changes.name = { before: target.name, after: dto.name };
      }
      if (dto.pro_days !== undefined) {
        if (dto.pro_days === 0)
          await db.query(
            "UPDATE users SET pro_until=NULL,theme='light' WHERE id=$1",
            [targetId],
          );
        else
          await db.query(
            "UPDATE users SET pro_until=greatest(coalesce(pro_until,now()),now())+($2*interval '1 day') WHERE id=$1",
            [targetId, dto.pro_days],
          );
      }
      const updated = (
        await db.query('SELECT id,name,pro_until FROM users WHERE id=$1', [
          targetId,
        ])
      ).rows[0];
      if (dto.pro_days !== undefined)
        changes.pro = {
          before: target.pro_until,
          after: updated.pro_until,
          days: dto.pro_days,
        };
      await db.query(
        "INSERT INTO admin_user_actions(actor_id,target_id,action,details) VALUES($1,$2,'update',$3)",
        [actorId, targetId, JSON.stringify(changes)],
      );
      return updated;
    });
  }
  async remove(actorId: string, targetId: string, confirmation: string) {
    return this.db.transaction(async (db) => {
      const target = await this.authorize(db, actorId, targetId);
      if (actorId === targetId)
        throw new BadRequestException('CANNOT_DELETE_SELF');
      if (confirmation !== target.name)
        throw new BadRequestException('DELETE_CONFIRMATION_REQUIRED');
      await db.query(
        "INSERT INTO admin_user_actions(actor_id,target_id,action,details) VALUES($1,$2,'delete',$3)",
        [
          actorId,
          targetId,
          JSON.stringify({ name: target.name, role: target.role }),
        ],
      );
      // Keep other users' payment records when their former reviewer is deleted.
      await db.query(
        'UPDATE payments SET reviewed_by=NULL WHERE reviewed_by=$1',
        [targetId],
      );
      await db.query('DELETE FROM users WHERE id=$1', [targetId]);
      return { ok: true };
    });
  }
}

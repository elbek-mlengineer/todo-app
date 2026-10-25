import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TaskDto, TaskQueryDto, UpdateTaskDto } from './dto';
@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}
  async list(userId: string, q: TaskQueryDto) {
    const params: any[] = [userId],
      where = ['user_id=$1'];
    const add = (sql: string, value: any) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (q.search) {
      params.push(`%${q.search.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(
        `(title ILIKE $${params.length} OR description ILIKE $${params.length})`,
      );
    }
    if (q.status && q.status !== 'all')
      add('completed=?', q.status === 'completed');
    if (q.priority) add('priority=?', q.priority);
    if (q.category) add('category=?', q.category);
    if (q.from) add('due_at>=?', q.from);
    if (q.to) add('due_at<?', q.to);
    const filter = where.join(' AND ');
    const order =
      q.sort === 'due'
        ? 'completed ASC, due_at ASC NULLS LAST, created_at DESC'
        : q.sort === 'priority'
          ? "completed ASC, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC"
          : 'completed ASC, created_at DESC';
    const total = Number(
      (
        await this.db.query(
          `SELECT count(*) FROM tasks WHERE ${filter}`,
          params,
        )
      ).rows[0].count,
    );
    const { rows } = await this.db.query(
      `SELECT * FROM tasks WHERE ${filter} ORDER BY ${order}, id LIMIT 30 OFFSET $${params.length + 1}`,
      [...params, ((q.page || 1) - 1) * 30],
    );
    return {
      items: rows,
      total,
      page: q.page || 1,
      pages: Math.max(1, Math.ceil(total / 30)),
    };
  }
  async stats(userId: string) {
    const { rows } = await this.db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE completed)::int AS completed, count(*) FILTER (WHERE NOT completed)::int AS active, count(*) FILTER (WHERE NOT completed AND due_at<now())::int AS overdue FROM tasks WHERE user_id=$1`,
      [userId],
    );
    return rows[0];
  }
  validateDate(value?: string | null) {
    if (
      value &&
      (!/(Z|[+-]\d{2}:\d{2})$/i.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      throw new BadRequestException('INVALID_DATE');
  }
  async schedule(db: any, task: any) {
    await db.query('DELETE FROM reminders WHERE task_id=$1', [task.id]);
    await db.query(
      "UPDATE notifications SET telegram_status='skip' WHERE task_id=$1 AND telegram_status='pending'",
      [task.id],
    );
    if (!task.due_at || task.completed || !task.reminder) return;
    const due = new Date(task.due_at).getTime(),
      now = Date.now();
    if (due <= now) return;
    if (due - 900000 > now)
      await db.query(
        "INSERT INTO reminders(task_id,revision,kind,deliver_at) VALUES($1,$2,'soon',$3)",
        [task.id, task.revision, new Date(due - 900000)],
      );
    await db.query(
      "INSERT INTO reminders(task_id,revision,kind,deliver_at) VALUES($1,$2,'due',$3)",
      [task.id, task.revision, new Date(due)],
    );
  }
  async create(userId: string, dto: TaskDto) {
    this.validateDate(dto.due_at);
    return this.db.transaction(async (db) => {
      const task = (
        await db.query(
          'INSERT INTO tasks(user_id,title,description,priority,category,due_at,reminder) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            userId,
            dto.title,
            dto.description ?? '',
            dto.priority ?? 'medium',
            dto.category ?? 'personal',
            dto.due_at || null,
            dto.reminder ?? true,
          ],
        )
      ).rows[0];
      await this.schedule(db, task);
      return task;
    });
  }
  async update(userId: string, id: string, dto: UpdateTaskDto) {
    this.validateDate(dto.due_at);
    return this.db.transaction(async (db) => {
      const old = (
        await db.query(
          'SELECT * FROM tasks WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, userId],
        )
      ).rows[0];
      if (!old) throw new NotFoundException('TASK_NOT_FOUND');
      const changes = Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      );
      const next = { ...old, ...changes };
      const task = (
        await db.query(
          'UPDATE tasks SET title=$3,description=$4,priority=$5,category=$6,due_at=$7,reminder=$8,completed=$9,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
          [
            id,
            userId,
            next.title,
            next.description,
            next.priority,
            next.category,
            next.due_at,
            next.reminder,
            next.completed,
          ],
        )
      ).rows[0];
      await this.schedule(db, task);
      return task;
    });
  }
  async remove(userId: string, id: string) {
    const result = await this.db.query(
      'DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING id',
      [id, userId],
    );
    if (!result.rows.length) throw new NotFoundException('TASK_NOT_FOUND');
    return { ok: true };
  }
}

import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class TaskDto {
  @IsString() @Transform(trim) @MinLength(1) @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) priority?: string;
  @IsOptional()
  @IsIn(['personal', 'work', 'learning', 'other'])
  category?: string;
  @ValidateIf((o) => o.due_at !== undefined && o.due_at !== null)
  @IsISO8601({ strict: true })
  due_at?: string | null;
  @IsOptional() @IsBoolean() reminder?: boolean;
}
export class UpdateTaskDto {
  @ValidateIf((o) => o.title !== undefined)
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(160)
  title?: string;
  @ValidateIf((o) => o.description !== undefined)
  @IsString()
  @MaxLength(4000)
  description?: string;
  @ValidateIf((o) => o.priority !== undefined)
  @IsIn(['low', 'medium', 'high'])
  priority?: string;
  @ValidateIf((o) => o.category !== undefined)
  @IsIn(['personal', 'work', 'learning', 'other'])
  category?: string;
  @ValidateIf((o) => o.due_at !== undefined && o.due_at !== null)
  @IsISO8601({ strict: true })
  due_at?: string | null;
  @ValidateIf((o) => o.reminder !== undefined) @IsBoolean() reminder?: boolean;
  @ValidateIf((o) => o.completed !== undefined)
  @IsBoolean()
  completed?: boolean;
}
export class TaskQueryDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsIn(['all', 'active', 'completed']) status?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) priority?: string;
  @IsOptional()
  @IsIn(['personal', 'work', 'learning', 'other'])
  category?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @IsOptional() @IsIn(['newest', 'due', 'priority']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page?: number;
}
export class SettingsDto {
  @ValidateIf((o) => o.name !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ValidateIf((o) => o.locale !== undefined)
  @IsIn(['uz', 'en'])
  locale?: string;
  @ValidateIf((o) => o.timezone !== undefined)
  @IsString()
  @MaxLength(80)
  timezone?: string;
  @ValidateIf((o) => o.theme !== undefined)
  @IsIn(['light', 'dark', 'forest', 'lavender', 'sunset', 'ocean'])
  theme?: string;
  @ValidateIf((o) => o.telegram_enabled !== undefined)
  @IsBoolean()
  telegram_enabled?: boolean;
  @ValidateIf((o) => o.in_app_enabled !== undefined)
  @IsBoolean()
  in_app_enabled?: boolean;
}
export class PaymentDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class ReviewDto {
  @IsIn(['approved', 'rejected']) status: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AdminUserDto {
  @ValidateIf((o) => o.name !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ValidateIf((o) => o.pro_days !== undefined)
  @IsInt()
  @Min(0)
  @Max(3660)
  pro_days?: number;
}
export class DeleteUserDto {
  @IsString() @MinLength(1) @MaxLength(100) confirmation!: string;
}

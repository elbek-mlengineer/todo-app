import { AdminUsersService } from './admin-users.service';
import { TelegramLoginService } from './telegram-login.service';
import { Module } from '@nestjs/common';
import { AppController, HealthController } from './app.controller';
import { AuthController } from './auth.controller';
import { DatabaseService } from './database.service';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { TasksService } from './tasks.service';
import { PaymentsService } from './payments.service';
import { RemindersService } from './reminders.service';

@Module({
  imports: [],
  controllers: [AppController, AuthController, HealthController],
  providers: [
    DatabaseService,
    AdminUsersService,
    AuthService,
    TelegramLoginService,
    AuthGuard,
    TasksService,
    PaymentsService,
    RemindersService,
  ],
})
export class AppModule {}

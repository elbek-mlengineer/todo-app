import './config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import { DatabaseService } from './database.service';

async function bootstrap() {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is missing. Run npm run setup first.');
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.WEB_URL?.startsWith('https://')
  )
    throw new Error('Production requires an HTTPS WEB_URL.');
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  app.enableShutdownHooks();
  try {
    await app.get(DatabaseService).query('SELECT id FROM users LIMIT 1');
    await app.listen(process.env.PORT || 3001, process.env.HOST || '127.0.0.1');
  } catch (error) {
    await app.close();
    throw error;
  }
}
bootstrap().catch((error) => {
  console.error('Backend startup failed:', error.message);
  process.exitCode = 1;
});

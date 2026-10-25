import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { TelegramLoginService, botUsername } from './telegram-login.service';
class TelegramBeginDto {
  @IsOptional() @IsBoolean() link?: boolean;
  @IsOptional() @IsIn(['uz', 'en']) locale?: 'uz' | 'en';
}
class TelegramVerifyDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { paymentConfig } from './config';
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly telegram: TelegramLoginService,
  ) {}
  @Get('config') config() {
    return {
      providers: this.auth.available(),
      payment: paymentConfig(),
      bot: botUsername() || null,
    };
  }
  @Get('me') async me(@Req() req: Request) {
    const user = await this.auth.current(req);
    return { user: user ? await this.auth.publicUser(user) : null };
  }
  @Post('telegram/begin') beginTelegram(
    @Body() body: TelegramBeginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.telegram.begin(
      req,
      res,
      body.link === true,
      body.locale || 'uz',
    );
  }
  @Post('telegram/verify') verifyTelegram(
    @Body() body: TelegramVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.telegram.verify(req, res, body.code);
  }
  @Get(':provider/start') start(
    @Param('provider') provider: string,
    @Query('link') link: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.auth.start(provider, link === '1', req, res);
  }
  @Get(':provider/callback') callback(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.auth.callback(provider, req, res);
  }
  @Post('logout') logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.logout(req, res);
  }
}

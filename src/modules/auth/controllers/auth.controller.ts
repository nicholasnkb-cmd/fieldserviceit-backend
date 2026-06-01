import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { Public } from '../../../common/decorators/public.decorator';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { RegisterBusinessDto } from '../dto/register-business.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { TrackTicketDto } from '../dto/track-ticket.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { clearAuthCookies, readRefreshCookie, setAuthCookies } from '../auth-cookies';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.email, body.password);
    setAuthCookies(res, result, req);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.registerPublic(body);
    setAuthCookies(res, result, req);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register-business')
  @HttpCode(HttpStatus.CREATED)
  async registerBusiness(@Body() body: RegisterBusinessDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.registerBusiness(body);
    setAuthCookies(res, result, req);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 120000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('track-ticket')
  @HttpCode(HttpStatus.OK)
  async trackTicket(@Body() body: TrackTicketDto) {
    return this.authService.trackTicket(body.email, body.ticketNumber);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = body.refreshToken || readRefreshCookie(req);
    const result = await this.authService.refresh(refreshToken);
    setAuthCookies(res, result, req);
    return result;
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = body.refreshToken || readRefreshCookie(req);
    clearAuthCookies(res, req);
    return this.authService.logout(refreshToken);
  }

  @Public()
  @Get('verify-email/:token')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body.email);
  }
}

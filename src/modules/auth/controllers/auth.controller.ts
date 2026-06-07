import { Controller, Post, Get, Body, Param, Query, Delete, HttpCode, HttpStatus, Req, Res, UseGuards } from '@nestjs/common';
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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { OidcAuthService } from '../services/oidc-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private oidcAuthService: OidcAuthService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.email, body.password, body.mfaCode, this.clientContext(req));
    if ('accessToken' in result && 'refreshToken' in result) setAuthCookies(res, result as any, req);
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

  @Public()
  @Get('sso/providers')
  ssoProviders(@Query('email') email?: string) {
    return this.oidcAuthService.providers(email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('sso/:id/start')
  startSso(@Param('id') id: string, @Body() body: { redirectPath?: string }) {
    return this.oidcAuthService.start(id, body.redirectPath);
  }

  @Public()
  @Get('sso/:id/callback')
  async ssoCallback(
    @Param('id') id: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontend = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    try {
      return res.redirect(await this.oidcAuthService.callback(id, code, state));
    } catch {
      return res.redirect(`${frontend}/login?ssoError=${encodeURIComponent('Single sign-on could not be completed')}`);
    }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('sso/exchange')
  async exchangeSso(
    @Body() body: { code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const login = await this.oidcAuthService.consumeLoginCode(body.code);
    const result = await this.authService.completeSsoLogin(login.userId, this.clientContext(req), true);
    if ('accessToken' in result && 'refreshToken' in result) setAuthCookies(res, result as any, req);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('mfa/challenge/setup')
  beginChallengeSetup(@Body() body: { challengeToken: string }) {
    return this.authService.beginChallengeEnrollment(body.challengeToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('mfa/challenge/confirm')
  async confirmChallengeSetup(
    @Body() body: { challengeToken: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.confirmChallengeEnrollment(body.challengeToken, body.code, this.clientContext(req));
    setAuthCookies(res, result, req);
    return result;
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser() user: CurrentUserType) {
    return this.authService.mfaStatus(user.id);
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  beginMfaSetup(@CurrentUser() user: CurrentUserType) {
    return this.authService.beginMfaSetup(user);
  }

  @Post('mfa/confirm')
  @UseGuards(JwtAuthGuard)
  confirmMfaSetup(@CurrentUser() user: CurrentUserType, @Body() body: { code: string }) {
    return this.authService.confirmMfaSetup(user, body.code);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  disableMfa(@CurrentUser() user: CurrentUserType, @Body() body: { code: string; password: string }) {
    return this.authService.disableMfa(user.id, body.code, body.password);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(@CurrentUser() user: CurrentUserType) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.authService.revokeSession(user.id, id, user.id);
  }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  revokeOtherSessions(@CurrentUser() user: CurrentUserType) {
    return this.authService.revokeOtherSessions(user.id, user.sessionId);
  }

  private clientContext(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
    return {
      ipAddress: forwardedIp || req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    };
  }
}

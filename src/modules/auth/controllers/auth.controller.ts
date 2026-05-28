import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service';
import { Public } from '../../../common/decorators/public.decorator';

type RegisterBody = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  location?: string;
  preferredContactMethod?: string;
  timezone?: string;
  planName?: string;
};

type RegisterBusinessBody = RegisterBody & {
  jobTitle?: string;
  department?: string;
  companyName?: string;
  inviteCode?: string;
  domain?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Get('debug-register')
  @HttpCode(HttpStatus.OK)
  async debugRegister() {
    const result: Record<string, any> = {};
    try {
      const email = 'debug-' + Date.now() + '@test.com';
      const hash = await require('bcryptjs').hash('Test1234!', 4);
      result.step1 = 'hash_done';

      const user = await this.authService['prisma'].user.create({
        data: { email, passwordHash: hash, firstName: 'Debug', lastName: 'User', role: 'CLIENT', userType: 'PUBLIC', emailVerified: true },
      });
      result.step2 = 'user_created';
      result.userId = user?.id;

      try {
        const tokens = await this.authService['generateTokens'](user);
        result.step3 = 'tokens_generated';
        result.hasAccessToken = !!tokens?.accessToken;
      } catch (err: any) {
        result.step3 = 'generateTokens_failed';
        result.tokenError = err?.message || String(err);
        result.tokenStack = err?.stack?.split('\n').slice(0, 3).join(' | ');
      }

      return result;
    } catch (err: any) {
      return { error: err?.message || String(err), stack: err?.stack?.split('\n').slice(0, 5).join('\n') || 'no stack' };
    }
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterBody) {
    return this.authService.registerPublic(body);
  }

  @Public()
  @Post('register-business')
  @HttpCode(HttpStatus.CREATED)
  async registerBusiness(@Body() body: RegisterBusinessBody) {
    return this.authService.registerBusiness(body);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('track-ticket')
  @HttpCode(HttpStatus.OK)
  async trackTicket(@Body() body: { email: string; ticketNumber: string }) {
    return this.authService.trackTicket(body.email, body.ticketNumber);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @Public()
  @Get('verify-email/:token')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email);
  }
}

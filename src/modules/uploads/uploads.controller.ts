import { Body, Controller, Get, Param, Post, Res, UseGuards, UseInterceptors, UploadedFile, UploadedFiles, UnprocessableEntityException } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { SettingsService } from '../settings/services/settings.service';

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SIGNATURE_MIMES = ['image/png', 'image/jpeg'];
const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_BRANDING_SIZE = 5 * 1024 * 1024;

function mimeFilter(allowed: string[]) {
  return (req: any, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new UnprocessableEntityException(`File type ${file.mimetype} not allowed. Accepted: ${allowed.join(', ')}`), false);
  };
}

@Controller('uploads')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class UploadsController {
  constructor(
    private uploadsService: UploadsService,
    private settingsService: SettingsService,
  ) {}

  @AuthorizationExempt('Upload service constrains files to the authenticated user and tenant', 'platform-operations', '2026-09-30')
  @Post('photo')
  @UseGuards(BusinessOnlyGuard)
  @UseInterceptors(FilesInterceptor('photos', 10, {
    limits: { fileSize: MAX_PHOTO_SIZE },
    fileFilter: mimeFilter(PHOTO_MIMES),
  }))
  uploadPhotos(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: CurrentUserType) {
    const companyDir = user.companyId || 'public';
    return this.uploadsService.saveFiles(files, `photos/${companyDir}`);
  }

  @AuthorizationExempt('Upload service constrains files to the authenticated user and tenant', 'platform-operations', '2026-09-30')
  @Post('signature')
  @UseGuards(BusinessOnlyGuard)
  @UseInterceptors(FileInterceptor('signature', {
    limits: { fileSize: MAX_SIGNATURE_SIZE },
    fileFilter: mimeFilter(SIGNATURE_MIMES),
  }))
  uploadSignature(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: CurrentUserType) {
    const companyDir = user.companyId || 'public';
    return this.uploadsService.saveFile(file, `signatures/${companyDir}`);
  }

  @AuthorizationExempt('Upload service constrains files to the authenticated user and tenant', 'platform-operations', '2026-09-30')
  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', {
    limits: { fileSize: MAX_AVATAR_SIZE },
    fileFilter: mimeFilter(AVATAR_MIMES),
  }))
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveFile(file, 'avatars');
  }

  @Post('branding')
  @RequirePermissions('settings.manage')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: MAX_BRANDING_SIZE },
    fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/webp']),
  }))
  async uploadBrandingImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('field') field: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const companyId = user.effectiveCompanyId || user.companyId;
    const companyDir = companyId || 'platform';
    const url = await this.uploadsService.saveFile(file, `branding/${companyDir}`);
    const company = await this.settingsService.configureUploadedImage(companyId, field, url);
    return { url, field, company };
  }

  @Post('ticket')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('tickets.edit')
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  }))
  uploadTicketFiles(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: CurrentUserType) {
    const companyDir = user.companyId || 'public';
    return this.uploadsService.saveProtectedFiles(files, `tickets/${companyDir}`, user.companyId);
  }

  @Get('protected/:token')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('tickets.view')
  async downloadProtectedFile(
    @Param('token') token: string,
    @CurrentUser() user: CurrentUserType,
    @Res() res: Response,
  ) {
    const file = await this.uploadsService.readProtectedFile(token, user);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(file.fileName || 'download').replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }
}

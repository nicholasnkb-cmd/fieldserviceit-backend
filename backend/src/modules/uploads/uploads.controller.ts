import { Controller, Post, UseGuards, UseInterceptors, UploadedFile, UploadedFiles, UnprocessableEntityException } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SIGNATURE_MIMES = ['image/png', 'image/jpeg'];
const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

function mimeFilter(allowed: string[]) {
  return (req: any, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new UnprocessableEntityException(`File type ${file.mimetype} not allowed. Accepted: ${allowed.join(', ')}`), false);
  };
}

@Controller('uploads')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post('photo')
  @UseGuards(BusinessOnlyGuard)
  @UseInterceptors(FilesInterceptor('photos', 10, {
    limits: { fileSize: MAX_PHOTO_SIZE },
    fileFilter: mimeFilter(PHOTO_MIMES),
  }))
  uploadPhotos(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: any) {
    const companyDir = user.companyId || 'public';
    return this.uploadsService.saveFiles(files, `photos/${companyDir}`);
  }

  @Post('signature')
  @UseGuards(BusinessOnlyGuard)
  @UseInterceptors(FileInterceptor('signature', {
    limits: { fileSize: MAX_SIGNATURE_SIZE },
    fileFilter: mimeFilter(SIGNATURE_MIMES),
  }))
  uploadSignature(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    const companyDir = user.companyId || 'public';
    return this.uploadsService.saveFile(file, `signatures/${companyDir}`);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', {
    limits: { fileSize: MAX_AVATAR_SIZE },
    fileFilter: mimeFilter(AVATAR_MIMES),
  }))
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveFile(file, 'avatars');
  }

  @Post('ticket')
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  }))
  uploadTicketFiles(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: any) {
    const companyDir = user.companyId || 'public';
    return this.uploadsService.saveFiles(files, `tickets/${companyDir}`);
  }
}

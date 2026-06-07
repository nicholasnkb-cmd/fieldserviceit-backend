import { Module } from '@nestjs/common';
import { PlatformSecurityController } from './platform-security.controller';
import { PlatformSecurityService } from './platform-security.service';

@Module({
  controllers: [PlatformSecurityController],
  providers: [PlatformSecurityService],
  exports: [PlatformSecurityService],
})
export class PlatformSecurityModule {}

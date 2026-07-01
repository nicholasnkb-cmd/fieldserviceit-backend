import { Module } from '@nestjs/common';
import { SecurityCenterController } from './security-center.controller';
import { SecurityCenterService } from './security-center.service';

@Module({
  controllers: [SecurityCenterController],
  providers: [SecurityCenterService],
})
export class SecurityCenterModule {}

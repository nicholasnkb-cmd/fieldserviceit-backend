import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CmdbService } from '../services/cmdb.service';

@Controller('mdm')
export class MdmEnrollmentController {
  constructor(private cmdbService: CmdbService) {}

  @Post('enroll')
  enroll(@Body() dto: any) {
    return this.cmdbService.enrollWithToken(dto);
  }

  @Post('devices/:id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: any, @Headers('x-device-token') headerToken?: string) {
    return this.cmdbService.checkInWithDeviceToken(id, headerToken || dto.deviceToken, dto);
  }

  @Get('devices/:id/commands')
  listCommands(@Param('id') id: string, @Query('deviceToken') queryToken?: string, @Headers('x-device-token') headerToken?: string) {
    return this.cmdbService.listDeviceCommandsByToken(id, headerToken || queryToken || '');
  }

  @Post('commands/:id/complete')
  completeCommand(@Param('id') id: string, @Body() dto: any, @Headers('x-device-token') headerToken?: string) {
    return this.cmdbService.completeDeviceCommand(id, headerToken || dto.deviceToken, dto);
  }
}

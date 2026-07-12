import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Res } from '@nestjs/common';
import { Response } from 'express';
import { EducationService } from './education.service';

@Controller('education/api')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  @Get('health')
  health() {
    return this.educationService.health();
  }

  @Get('state')
  getState() {
    return this.educationService.getState();
  }

  @Put('state')
  saveState(@Body() body: any) {
    return this.educationService.saveState(body.snapshot);
  }

  @Post('reset')
  resetState() {
    return this.educationService.resetState();
  }

  @Post('login')
  login(@Body() body: any) {
    return this.educationService.login(body.profileId, body.password);
  }

  @Get('session')
  session(@Headers('authorization') authorization = '') {
    return this.educationService.getSession(authorization);
  }

  @Get('users')
  listUsers(@Headers('authorization') authorization = '') {
    return this.educationService.listUsers(authorization);
  }

  @Post('users')
  createUser(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.educationService.createUser(authorization, body);
  }

  @Patch('users/:profileId')
  updateUser(@Headers('authorization') authorization = '', @Param('profileId') profileId: string, @Body() body: any) {
    return this.educationService.updateUser(authorization, profileId, body);
  }

  @Post('password/change')
  changePassword(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.educationService.changePassword(authorization, body);
  }

  @Post('password/reset')
  resetPassword(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.educationService.resetPassword(authorization, body);
  }

  @Get('files')
  listFiles() {
    return this.educationService.listFiles();
  }

  @Post('files')
  async uploadFile(@Body() body: any) {
    const result = await this.educationService.uploadFile(body);
    return { ...result, statusCode: 201 };
  }

  @Get('files/:fileId/download')
  async downloadFile(@Param('fileId') fileId: string, @Res() response: Response) {
    const { file, stream } = await this.educationService.fileForDownload(fileId);
    response.setHeader('Content-Type', file.type || 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="${String(file.name).replace(/"/g, '')}"`);
    stream.pipe(response);
  }

  @Post('notifications/test')
  async sendNotificationTest(@Body() body: any) {
    const result = await this.educationService.sendNotificationTest(body);
    return { ...result, statusCode: 201 };
  }

  @Get('backups')
  listBackups() {
    return this.educationService.listBackups();
  }

  @Post('backups')
  async createBackup(@Headers('authorization') authorization = '') {
    const result = await this.educationService.createBackup(authorization);
    return { ...result, statusCode: 201 };
  }
}

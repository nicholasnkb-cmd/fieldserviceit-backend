import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ScimTokenGuard } from '../../../common/guards/scim-token.guard';
import { ScimService } from '../services/scim.service';
import { RawResponse } from '../../../common/decorators/raw-response.decorator';

@Controller('scim/v2')
@UseGuards(ScimTokenGuard)
@RawResponse('application/scim+json')
export class ScimController {
  constructor(private scim: ScimService) {}

  @Get('ServiceProviderConfig')
  config() {
    return this.scim.serviceProviderConfig();
  }

  @Get('Users')
  listUsers(@Req() req: any, @Query() query: any) {
    return this.scim.listUsers(req.scim.companyId, query);
  }

  @Get('Users/:id')
  getUser(@Req() req: any, @Param('id') id: string) {
    return this.scim.getUser(req.scim.companyId, id);
  }

  @Post('Users')
  createUser(@Req() req: any, @Body() body: any) {
    return this.scim.createUser(req.scim.companyId, body);
  }

  @Put('Users/:id')
  replaceUser(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scim.replaceUser(req.scim.companyId, id, body);
  }

  @Patch('Users/:id')
  patchUser(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scim.patchUser(req.scim.companyId, id, body);
  }

  @Delete('Users/:id')
  @HttpCode(204)
  async deleteUser(@Req() req: any, @Param('id') id: string) {
    await this.scim.deleteUser(req.scim.companyId, id);
  }

  @Get('Groups')
  listGroups(@Req() req: any, @Query() query: any) {
    return this.scim.listGroups(req.scim.companyId, query);
  }

  @Get('Groups/:id')
  getGroup(@Req() req: any, @Param('id') id: string) {
    return this.scim.getGroup(req.scim.companyId, id);
  }

  @Post('Groups')
  createGroup(@Req() req: any, @Body() body: any) {
    return this.scim.createGroup(req.scim.companyId, body);
  }

  @Put('Groups/:id')
  replaceGroup(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scim.replaceGroup(req.scim.companyId, id, body);
  }

  @Patch('Groups/:id')
  patchGroup(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scim.patchGroup(req.scim.companyId, id, body);
  }

  @Delete('Groups/:id')
  @HttpCode(204)
  async deleteGroup(@Req() req: any, @Param('id') id: string) {
    await this.scim.deleteGroup(req.scim.companyId, id);
  }
}

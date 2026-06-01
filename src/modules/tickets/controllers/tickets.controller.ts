import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res, Header, NotFoundException, UnauthorizedException, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { TicketsService } from '../services/tickets.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { TicketTimelineService } from '../services/ticket-timeline.service';
import { TicketExportService } from '../services/ticket-export.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PrismaService } from '../../../database/prisma.service';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';

@Controller('tickets')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@RequireFeature('tickets')
export class TicketsController {
  constructor(
    private ticketsService: TicketsService,
    private timelineService: TicketTimelineService,
    private exportService: TicketExportService,
    private prisma: PrismaService,
  ) {}

  private async assertTicketAccess(id: string, user: CurrentUserType) {
    const where: any = { id, deletedAt: null };
    if (user.role === 'SUPER_ADMIN' && !user.companyId) {
      // Global super admin can access all tickets, including public/free-user tickets.
    } else if (user.role === 'GLOBAL_TECH') {
      where.OR = [
        { companyId: null },
        { createdBy: { userType: 'PUBLIC' } },
      ];
    } else if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else {
      where.companyId = user.companyId;
    }
    const ticket = await this.prisma.ticket.findFirst({ where, select: { id: true, companyId: true, createdById: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.create(dto, user.companyId, user.id, user.userType);
  }

  @Get()
  findAll(@Query() query: any, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.findAll(user, query);
  }

  @Get('export/csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="tickets.csv"')
  async exportCsv(@Query('status') status: string, @CurrentUser() user: CurrentUserType, @Res() res: Response) {
    const csv = await this.exportService.exportCsv(user.companyId, status);
    res.send(csv);
  }

  @Get('board')
  async getBoard(@CurrentUser() user: CurrentUserType) {
    const where: any = { deletedAt: null };
    if (user.role === 'SUPER_ADMIN' && !user.companyId) {
      // Global super admin board.
    } else if (user.role === 'GLOBAL_TECH') {
      where.OR = [
        { companyId: null },
        { createdBy: { userType: 'PUBLIC' } },
      ];
    } else {
      where.companyId = user.companyId;
    }
    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const columns = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
    const board = columns.map((s) => ({ status: s, tickets: tickets.filter((t: any) => t.status === s) }));
    return { columns: board };
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.findOne(id, user);
  }

  @BusinessOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.update(id, dto, user, user.id);
  }

  @BusinessOnly()
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.remove(id, user);
  }

  @BusinessOnly()
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.assign(id, userId, user, user.id);
  }

  @BusinessOnly()
  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body('resolution') resolution: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.resolve(id, resolution, user, user.id);
  }

  @Post(':id/comments')
  async addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    return this.timelineService.addEntry(id, user.id, 'COMMENT', dto.comment, undefined, undefined, dto.isInternal);
  }

  @Get(':id/timeline')
  async getTimeline(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    return this.timelineService.getTimeline(id);
  }

  @BusinessOnly()
  @Post(':id/attachments')
  async addAttachment(@Param('id') id: string, @Body() body: { fileUrl: string; fileName: string; fileSize: number; mimeType: string }, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    const attachment = await this.prisma.ticketAttachment.create({
      data: { ticketId: id, fileUrl: body.fileUrl, fileName: body.fileName, fileSize: body.fileSize, mimeType: body.mimeType, uploadedById: user.id },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.timelineService.addEntry(id, user.id, 'ATTACHMENT', `File attached: ${body.fileName}`);
    return attachment;
  }

  @BusinessOnly()
  @Delete(':id/attachments/:attachmentId')
  async removeAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    const rows = await this.prisma.query<any[]>(`SELECT id FROM TicketAttachment WHERE id = ? AND ticketId = ? LIMIT 1`, [attachmentId, id]);
    if (!rows[0]) throw new NotFoundException('Attachment not found');
    await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });
    return { success: true };
  }

  @BusinessOnly()
  @Post('bulk/status')
  async bulkStatus(@Body() body: { ids: string[]; status: string }, @CurrentUser() user: CurrentUserType) {
    const results = [];
    for (const id of body.ids) {
      try {
        await this.ticketsService.update(id, { status: body.status }, user, user.id);
        results.push({ id, success: true });
      } catch { results.push({ id, success: false }); }
    }
    return { results };
  }

  @BusinessOnly()
  @Post('bulk/assign')
  async bulkAssign(@Body() body: { ids: string[]; userId: string }, @CurrentUser() user: CurrentUserType) {
    const results = [];
    for (const id of body.ids) {
      try {
        await this.ticketsService.assign(id, body.userId, user, user.id);
        results.push({ id, success: true });
      } catch { results.push({ id, success: false }); }
    }
    return { results };
  }

  @BusinessOnly()
  @Post('bulk/delete')
  async bulkDelete(@Body() body: { ids: string[] }, @CurrentUser() user: CurrentUserType) {
    const results = [];
    for (const id of body.ids) {
      try {
        await this.ticketsService.remove(id, user);
        results.push({ id, success: true });
      } catch { results.push({ id, success: false }); }
    }
    return { results };
  }

  @Get('templates/list')
  async listTemplates(@CurrentUser() user: CurrentUserType) {
    return this.prisma.ticketTemplate.findMany({
      where: { companyId: user.companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  @BusinessOnly()
  @Post('templates')
  async createTemplate(@Body() body: { name: string; description?: string; category?: string; subcategory?: string; priority?: string; title?: string; body?: string }, @CurrentUser() user: CurrentUserType) {
    const data = {
      name: body.name,
      description: body.description,
      category: body.category,
      subcategory: body.subcategory,
      priority: body.priority,
      title: body.title,
      body: body.body,
      companyId: user.companyId,
    };
    Object.keys(data).forEach((key) => (data as any)[key] === undefined && delete (data as any)[key]);
    return this.prisma.ticketTemplate.create({
      data,
    });
  }

  @BusinessOnly()
  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    const template = await this.prisma.ticketTemplate.findMany({ where: { id, companyId: user.companyId, isActive: true } });
    if (!template[0]) throw new NotFoundException('Template not found');
    await this.prisma.ticketTemplate.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  @Post(':id/time')
  async addTimeEntry(@Param('id') id: string, @Body() body: { duration: number; description?: string; billable?: boolean; startTime?: string }, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    const entry = await this.prisma.timeEntry.create({
      data: {
        ticketId: id,
        userId: user.id,
        duration: body.duration,
        description: body.description,
        billable: body.billable ?? true,
        startTime: body.startTime ? new Date(body.startTime) : new Date(),
      },
    });
    await this.timelineService.addEntry(id, user.id, 'TIME', `Logged ${body.duration}m${body.description ? ': ' + body.description : ''}`);
    return entry;
  }

  @Get(':id/time')
  async getTimeEntries(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.prisma.timeEntry.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('inbound-email')
  async inboundEmail(
    @Body() body: { from: string; subject: string; text: string; html?: string },
    @Headers('x-api-key') apiKey?: string,
  ) {
    const expectedKey = process.env.INBOUND_EMAIL_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    const user = await this.prisma.user.findFirst({ where: { email: body.from, userType: 'PUBLIC' } });
    if (!user) throw new NotFoundException('No public user found for this email');

    const count = await this.prisma.ticket.count({ where: { createdById: user.id } });
    const ticketNumber = `TKT-EMAIL-${(count + 1).toString().padStart(5, '0')}`;
    const trackingToken = require('crypto').randomBytes(16).toString('hex');

    const ticket = await this.prisma.ticket.create({
      data: {
        title: body.subject || 'Email submission',
        description: body.text || body.html || '',
        contactName: user.firstName || user.email,
        contactEmail: user.email,
        contactPhone: '',
        ticketNumber,
        createdById: user.id,
        trackingToken,
        status: 'OPEN',
      },
    });
    await this.timelineService.addEntry(ticket.id, user.id, 'CREATED', 'Ticket created from email');
    return { ticketNumber, id: ticket.id };
  }
}

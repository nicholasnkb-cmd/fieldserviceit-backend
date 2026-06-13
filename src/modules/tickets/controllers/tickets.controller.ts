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
import { Public } from '../../../common/decorators/public.decorator';
import { TicketParticipantNotifierService } from '../services/ticket-participant-notifier.service';
import { EmailDeliveryService } from '../../notifications/services/email-delivery.service';
import { EmailService } from '../../notifications/services/email.service';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';

@Controller('tickets')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@RequireFeature('tickets')
@RequirePermissions('tickets.view')
export class TicketsController {
  constructor(
    private ticketsService: TicketsService,
    private timelineService: TicketTimelineService,
    private participantNotifier: TicketParticipantNotifierService,
    private emailDeliveryService: EmailDeliveryService,
    private emailService: EmailService,
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

  private canViewInternalTimeline(user: CurrentUserType) {
    return ['SUPER_ADMIN', 'GLOBAL_TECH', 'TENANT_ADMIN', 'TECHNICIAN'].includes(user.role)
      || user.permissionSlugs?.includes('tickets.sensitive.view');
  }

  @Post()
  @RequirePermissions('tickets.create')
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.create(dto, user.companyId, user.id, user.userType);
  }

  @Get()
  findAll(@Query() query: any, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.findAll(user, query);
  }

  @Get('export/csv')
  @RequirePermissions('tickets.export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="tickets.csv"')
  async exportCsv(@Query('status') status: string, @CurrentUser() user: CurrentUserType, @Res() res: Response) {
    const result = await this.ticketsService.findAll(user, { page: 1, limit: 10000, status });
    const csv = this.exportService.exportCsv(result.data);
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

  @Get('templates/list')
  async listTemplates(@CurrentUser() user: CurrentUserType) {
    return this.prisma.ticketTemplate.findMany({
      where: { companyId: user.companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.findOne(id, user);
  }

  @BusinessOnly()
  @Patch(':id')
  @RequirePermissions('tickets.edit')
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.update(id, dto, user, user.id);
  }

  @BusinessOnly()
  @Delete(':id')
  @RequirePermissions('tickets.delete')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.remove(id, user);
  }

  @BusinessOnly()
  @Post(':id/assign')
  @RequirePermissions('tickets.edit')
  assign(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.assign(id, userId, user, user.id);
  }

  @BusinessOnly()
  @Post(':id/resolve')
  @RequirePermissions('tickets.edit')
  resolve(@Param('id') id: string, @Body('resolution') resolution: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.resolve(id, resolution, user, user.id);
  }

  @Post(':id/comments')
  @RequirePermissions('tickets.edit')
  async addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    const entry = await this.timelineService.addEntry(id, user.id, 'COMMENT', dto.comment, undefined, undefined, dto.isInternal);
    if (!dto.isInternal) {
      await this.participantNotifier.notify(id, {
        action: 'Comment added',
        detail: dto.comment,
        actorId: user.id,
      });
    }
    return entry;
  }

  @Get(':id/timeline')
  async getTimeline(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    return this.timelineService.getTimeline(id, this.canViewInternalTimeline(user));
  }

  @Get(':id/email-deliveries')
  async getEmailDeliveries(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    if (user.userType === 'PUBLIC') throw new NotFoundException('Ticket not found');
    return this.emailDeliveryService.ticketHistory(id);
  }

  @BusinessOnly()
  @Post(':id/attachments')
  @RequirePermissions('tickets.edit')
  async addAttachment(@Param('id') id: string, @Body() body: { fileUrl: string; fileName: string; fileSize: number; mimeType: string }, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    const attachment = await this.prisma.ticketAttachment.create({
      data: { ticketId: id, fileUrl: body.fileUrl, fileName: body.fileName, fileSize: body.fileSize, mimeType: body.mimeType, uploadedById: user.id },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.timelineService.addEntry(id, user.id, 'ATTACHMENT', `File attached: ${body.fileName}`);
    await this.participantNotifier.notify(id, {
      action: 'Attachment added',
      detail: body.fileName,
      actorId: user.id,
    });
    return attachment;
  }

  @BusinessOnly()
  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('tickets.delete')
  async removeAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser() user: CurrentUserType) {
    await this.assertTicketAccess(id, user);
    const rows = await this.prisma.query<any[]>(`SELECT id, fileName FROM TicketAttachment WHERE id = ? AND ticketId = ? LIMIT 1`, [attachmentId, id]);
    if (!rows[0]) throw new NotFoundException('Attachment not found');
    await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });
    await this.timelineService.addEntry(id, user.id, 'ATTACHMENT_REMOVED', `File removed: ${rows[0].fileName || attachmentId}`);
    await this.participantNotifier.notify(id, {
      action: 'Attachment removed',
      detail: rows[0].fileName || attachmentId,
      actorId: user.id,
    });
    return { success: true };
  }

  @BusinessOnly()
  @Post('bulk/status')
  @RequirePermissions('tickets.edit')
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
  @RequirePermissions('tickets.edit')
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
  @RequirePermissions('tickets.delete')
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

  @BusinessOnly()
  @Post('templates')
  @RequirePermissions('tickets.edit')
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
  @RequirePermissions('tickets.delete')
  async deleteTemplate(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    const template = await this.prisma.ticketTemplate.findMany({ where: { id, companyId: user.companyId, isActive: true } });
    if (!template[0]) throw new NotFoundException('Template not found');
    await this.prisma.ticketTemplate.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  @Post(':id/time')
  @RequirePermissions('tickets.edit')
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
    await this.participantNotifier.notify(id, {
      action: 'Work time logged',
      detail: `${body.duration} minutes of work were logged.`,
      actorId: user.id,
      eventCategory: 'ticket_time',
    });
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
  @Public()
  @Post('inbound-email')
  @RequirePermissions()
  async inboundEmail(
    @Body() body: { from: string; subject: string; text?: string; html?: string; messageId?: string; inReplyTo?: string },
    @Headers('x-api-key') apiKey?: string,
  ) {
    if (!(await this.emailService.isWebhookSecretValid(apiKey))) {
      throw new UnauthorizedException('Invalid API key');
    }
    const senderEmail = this.extractEmail(body.from);
    if (!senderEmail) throw new NotFoundException('No sender email was provided');
    const message = this.emailText(body.text, body.html);
    const ticketNumber = `${body.subject || ''} ${message}`.match(/\bTKT-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase();
    const providerMessageId = String(body.messageId || '').trim();

    if (providerMessageId) {
      const existing = await this.prisma.query<any[]>(
        `SELECT id, ticketId FROM EmailInboundMessage WHERE providerMessageId = ? LIMIT 1`,
        [providerMessageId],
      );
      if (existing[0]) return { duplicate: true, id: existing[0].ticketId };
    }

    let tickets: any[] = [];
    if (ticketNumber) {
      tickets = await this.prisma.query<any[]>(
        `SELECT t.id, t.ticketNumber, t.contactEmail, t.createdById, u.email creatorEmail
         FROM Ticket t LEFT JOIN User u ON u.id = t.createdById
         WHERE UPPER(t.ticketNumber) = ? AND t.deletedAt IS NULL LIMIT 1`,
        [ticketNumber],
      );
    } else if (body.inReplyTo) {
      tickets = await this.prisma.query<any[]>(
        `SELECT t.id, t.ticketNumber, t.contactEmail, t.createdById, u.email creatorEmail
         FROM EmailDelivery d
         INNER JOIN Ticket t ON t.id = d.ticketId
         LEFT JOIN User u ON u.id = t.createdById
         WHERE d.providerMessageId = ? AND t.deletedAt IS NULL LIMIT 1`,
        [String(body.inReplyTo).trim()],
      );
    }
    if (tickets[0]) {
      const ticket = tickets[0];
      const allowedEmails = [ticket.contactEmail, ticket.creatorEmail]
        .filter(Boolean)
        .map((value: string) => value.trim().toLowerCase());
      if (!allowedEmails.includes(senderEmail)) throw new UnauthorizedException('Sender is not a participant on this ticket');
      const sender = await this.prisma.user.findFirst({ where: { email: senderEmail, deletedAt: null } });
      const actorId = sender?.id || ticket.createdById;
      const entry = await this.timelineService.addEntry(
        ticket.id,
        actorId,
        'COMMENT',
        message || 'Reply received by email',
        undefined,
        undefined,
        false,
      );
      if (providerMessageId) {
        await this.prisma.execute(
          `INSERT IGNORE INTO EmailInboundMessage (
            id, providerMessageId, senderEmail, ticketId, subject, status, createdAt
          ) VALUES (UUID(), ?, ?, ?, ?, 'PROCESSED', NOW(3))`,
          [providerMessageId, senderEmail, ticket.id, String(body.subject || '').slice(0, 255)],
        );
      }
      await this.participantNotifier.notify(ticket.id, {
        action: 'Reply received by email',
        detail: message,
        actorId,
        eventCategory: 'ticket_comments',
        excludeEmails: [senderEmail],
      });
      return { ticketNumber: ticket.ticketNumber, id: ticket.id, replied: true, timelineId: entry.id };
    }

    const user = await this.prisma.user.findFirst({ where: { email: senderEmail, userType: 'PUBLIC' } });
    if (!user) throw new NotFoundException('No public user found for this email');

    const count = await this.prisma.ticket.count({ where: { createdById: user.id } });
    const newTicketNumber = `TKT-EMAIL-${(count + 1).toString().padStart(5, '0')}`;
    const trackingToken = require('crypto').randomBytes(16).toString('hex');

    const ticket = await this.prisma.ticket.create({
      data: {
        title: body.subject || 'Email submission',
        description: message,
        contactName: user.firstName || user.email,
        contactEmail: user.email,
        contactPhone: '',
        ticketNumber: newTicketNumber,
        createdById: user.id,
        trackingToken,
        status: 'OPEN',
      },
    });
    if (providerMessageId) {
      await this.prisma.execute(
        `INSERT IGNORE INTO EmailInboundMessage (
          id, providerMessageId, senderEmail, ticketId, subject, status, createdAt
        ) VALUES (UUID(), ?, ?, ?, ?, 'PROCESSED', NOW(3))`,
        [providerMessageId, senderEmail, ticket.id, String(body.subject || '').slice(0, 255)],
      );
    }
    await this.timelineService.addEntry(ticket.id, user.id, 'CREATED', 'Ticket created from email');
    await this.participantNotifier.notify(ticket.id, {
      action: 'Ticket opened from email',
      detail: message,
      actorId: user.id,
      eventCategory: 'ticket_created',
    });
    return { ticketNumber: newTicketNumber, id: ticket.id };
  }

  private extractEmail(value: string) {
    const match = String(value || '').match(/<([^>]+)>/);
    const email = (match?.[1] || value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  private emailText(text?: string, html?: string) {
    const plain = String(text || '').trim();
    if (plain) return plain.slice(0, 20000);
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20000);
  }
}

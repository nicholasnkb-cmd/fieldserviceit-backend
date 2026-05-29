import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from '../../../common/guards/ws-auth.guard';

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' } })
@UseGuards(WsAuthGuard)
export class TicketsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token || client.handshake?.query?.token;
    if (!token) {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinCompany')
  handleJoinCompany(@ConnectedSocket() client: Socket, @MessageBody() companyId: string) {
    const user = client.data.user;
    if (!user?.companyId || (user.role !== 'SUPER_ADMIN' && user.companyId !== companyId)) {
      return { error: 'Forbidden' };
    }
    const roomCompanyId = user.role === 'SUPER_ADMIN' ? companyId : user.companyId;
    client.join(`company:${roomCompanyId}`);
    return { joined: roomCompanyId };
  }

  @SubscribeMessage('presence:online')
  handleOnline(@ConnectedSocket() client: Socket) {
    const user = client.data.user;
    if (!user?.id || !user?.companyId) return { error: 'Forbidden' };
    client.data.userId = user.id;
    client.data.companyId = user.companyId;
    if (!this.onlineUsers.has(user.companyId)) this.onlineUsers.set(user.companyId, new Set());
    this.onlineUsers.get(user.companyId)!.add(user.id);
    this.server.to(`company:${user.companyId}`).emit('presence:update', { online: Array.from(this.onlineUsers.get(user.companyId)!) });
    return { online: true };
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId && client.data.companyId) {
      const set = this.onlineUsers.get(client.data.companyId);
      if (set) {
        set.delete(client.data.userId);
        this.server.to(`company:${client.data.companyId}`).emit('presence:update', { online: Array.from(set) });
      }
    }
  }

  getOnlineUsers(companyId: string): string[] {
    return Array.from(this.onlineUsers.get(companyId) || []);
  }

  notifyTicketUpdate(companyId: string, event: string, data: any) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }
}

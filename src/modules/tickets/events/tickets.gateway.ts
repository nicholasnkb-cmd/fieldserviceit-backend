import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' } })
export class TicketsGateway {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, Set<string>>();

  @SubscribeMessage('joinCompany')
  handleJoinCompany(client: Socket, companyId: string) {
    client.join(`company:${companyId}`);
  }

  @SubscribeMessage('presence:online')
  handleOnline(client: Socket, data: { userId: string; companyId: string }) {
    client.data.userId = data.userId;
    client.data.companyId = data.companyId;
    if (!this.onlineUsers.has(data.companyId)) this.onlineUsers.set(data.companyId, new Set());
    this.onlineUsers.get(data.companyId)!.add(data.userId);
    this.server.to(`company:${data.companyId}`).emit('presence:update', { online: Array.from(this.onlineUsers.get(data.companyId)!) });
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

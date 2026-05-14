import { Server, Socket } from 'socket.io';
export declare class TicketsGateway {
    server: Server;
    private onlineUsers;
    handleJoinCompany(client: Socket, companyId: string): void;
    handleOnline(client: Socket, data: {
        userId: string;
        companyId: string;
    }): void;
    handleDisconnect(client: Socket): void;
    getOnlineUsers(companyId: string): string[];
    notifyTicketUpdate(companyId: string, event: string, data: any): void;
}

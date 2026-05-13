import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let socket: Socket | null = null;
let currentCompanyId: string | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    const s = socket;
    s.on('reconnect', () => {
      if (currentCompanyId) {
        s.emit('joinCompany', currentCompanyId);
      }
    });
  }
  return socket;
}

export function connectSocket(companyId: string): Socket {
  const s = getSocket();
  currentCompanyId = companyId;
  if (!s.connected) {
    s.connect();
  }
  s.off('connect').on('connect', () => {
    s.emit('joinCompany', companyId);
  });
  s.off('connect_error').on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
  currentCompanyId = null;
}

export function onSocketEvent(event: string, handler: (...args: any[]) => void): () => void {
  const s = getSocket();
  s.on(event, handler);
  return () => { s.off(event, handler); };
}

export function getCurrentCompanyId(): string | null {
  return currentCompanyId;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { getStatusColor } from '../../../../lib/utils';
import { useAuthStore } from '../../../../stores/authStore';
import { connectSocket, disconnectSocket, onSocketEvent } from '../../../../lib/socket';
import { useToast } from '../../../../components/ui/Toast';

const columns = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
const colColors: Record<string, string> = {
  OPEN: 'border-t-blue-500',
  ASSIGNED: 'border-t-indigo-500',
  IN_PROGRESS: 'border-t-yellow-500',
  ON_HOLD: 'border-t-orange-500',
  RESOLVED: 'border-t-emerald-500',
  CLOSED: 'border-t-gray-500',
};

export default function BoardPage() {
  const [board, setBoard] = useState<{ status: string; tickets: any[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const { user } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  const fetchBoard = useCallback(async () => {
    try {
      const data = await api.get('/tickets/board');
      setBoard(data.columns || []);
    } catch { router.push('/login'); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  useEffect(() => {
    if (!user?.companyId) return;
    connectSocket(user.companyId);
    const unsub = onSocketEvent('ticket:updated', fetchBoard);
    return () => { unsub(); disconnectSocket(); };
  }, [user?.companyId, fetchBoard]);

  const handleDrop = async (ticketId: string, newStatus: string) => {
    if (!ticketId) return;
    setDragging(null);
    try {
      await api.patch(`/tickets/${ticketId}`, { status: newStatus });
      toast('success', 'Ticket moved');
      fetchBoard();
    } catch (err: any) { toast('error', err.message); }
  };

  if (loading) return <div className="p-8">Loading board...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Kanban Board</h1>
        <Link href="/tickets" className="text-sm text-primary hover:underline">&larr; List View</Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {board.map((col) => (
          <div key={col.status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragging) handleDrop(dragging, col.status); }}
            className={`bg-gray-50 rounded-lg border-t-4 ${colColors[col.status] || 'border-t-gray-300'} p-3 min-h-[300px]`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">{col.status.replace(/_/g, ' ')}</h3>
              <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{col.tickets.length}</span>
            </div>
            <div className="space-y-2">
              {col.tickets.map((ticket) => (
                <div key={ticket.id}
                  draggable
                  onDragStart={() => setDragging(ticket.id)}
                  onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="bg-white rounded-md shadow-sm border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-primary text-xs">{ticket.ticketNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      ticket.priority === 'CRITICAL' ? 'bg-red-100 text-red-700'
                      : ticket.priority === 'HIGH' ? 'bg-orange-100 text-orange-700'
                      : ticket.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>{ticket.priority}</span>
                  </div>
                  <p className="text-gray-700 text-xs truncate">{ticket.title}</p>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                    <span>{ticket.contactName || '—'}</span>
                    <span>{ticket.assignedTo ? `${ticket.assignedTo.firstName[0]}.${ticket.assignedTo.lastName[0]}` : ''}</span>
                  </div>
                </div>
              ))}
              {col.tickets.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">Drop tickets here</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

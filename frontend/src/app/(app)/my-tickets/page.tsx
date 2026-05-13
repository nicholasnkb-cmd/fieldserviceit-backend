'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { formatDate, getStatusColor } from '../../../lib/utils';
import { ResponsiveTable } from '../../../components/ui/ResponsiveTable';
import { TableSkeleton } from '../../../components/ui/Skeleton';

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
  assignedTo?: { firstName: string; lastName: string };
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const router = useRouter();

  useEffect(() => {
    const params = filter ? `?status=${filter}` : '';
    api.get(`/tickets${params}`)
      .then((data) => setTickets(data.data || []))
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router, filter]);

  if (loading) return <div className="p-8"><TableSkeleton rows={8} cols={5} /></div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <div className="flex gap-2 flex-wrap">
          {['', 'OPEN', 'RESOLVED', 'CLOSED'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-full ${filter === s ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">You haven&apos;t submitted any tickets yet.</p>
          <a href="/submit-ticket" className="text-sm text-primary hover:underline">Submit your first ticket</a>
        </div>
      ) : (
        <ResponsiveTable>
          <table className="w-full bg-white rounded-lg shadow overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ticket#</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/tickets/${ticket.id}`)}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{ticket.ticketNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{ticket.title}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{ticket.priority}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}

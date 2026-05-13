'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate, getStatusColor } from '../../../lib/utils';

interface TicketData {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: { firstName: string; lastName: string };
  createdBy: { firstName: string; lastName: string; email: string };
  assignedTo?: { firstName: string; lastName: string; email: string };
  timeline: { id: string; action: string; comment?: string; isInternal?: boolean; oldValue?: string; newValue?: string; createdAt: string; actor: { firstName: string; lastName: string } }[];
  createdAt: string;
  updatedAt: string;
}

export default function TrackTicketPage() {
  const [email, setEmail] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTicket(null);
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/v1/auth/track-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ticketNumber }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Ticket not found');
      }

      const data = await res.json();
      setTicket(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h1 className="text-2xl font-bold mb-2">Track a Ticket</h1>
          <p className="text-sm text-gray-600 mb-6">
            Enter your email and ticket number to check the status of your request.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="ticketNumber" className="block text-sm font-medium text-gray-700">
                Ticket Number
              </label>
              <input
                id="ticketNumber"
                type="text"
                required
                placeholder="e.g. TKT-PUB-00001"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Track Ticket'}
            </button>
          </form>
        </div>

        {ticket && (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">{ticket.title}</h2>
                <p className="text-sm text-gray-500">{ticket.ticketNumber}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                {ticket.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <span className="text-gray-500">Priority:</span>{' '}
                <span className="font-medium">{ticket.priority}</span>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>{' '}
                <span className="font-medium">{formatDate(ticket.createdAt)}</span>
              </div>
              <div>
                <span className="text-gray-500">Reported by:</span>{' '}
                <span className="font-medium">
                  {ticket.createdBy.firstName} {ticket.createdBy.lastName}
                </span>
              </div>
              {ticket.assignedTo && (
                <div>
                  <span className="text-gray-500">Assigned to:</span>{' '}
                  <span className="font-medium">
                    {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                  </span>
                </div>
              )}
            </div>

            {ticket.description && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{ticket.description}</p>
              </div>
            )}

            {ticket.resolution && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Resolution</h3>
                <p className="text-sm text-gray-600 bg-green-50 p-3 rounded">{ticket.resolution}</p>
                {ticket.resolvedBy && <p className="text-xs text-gray-400 mt-1">Resolved by {ticket.resolvedBy.firstName} {ticket.resolvedBy.lastName} on {ticket.resolvedAt ? formatDate(ticket.resolvedAt) : ''}</p>}
              </div>
            )}

            {(ticket.timeline || []).filter((e: any) => e.action !== 'COMMENT' || !e.isInternal).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Activity</h3>
                <div className="space-y-3">
                  {ticket.timeline.filter((e: any) => e.action !== 'COMMENT' || !e.isInternal).map((entry) => {
                    const dotColor =
                      entry.action === 'COMMENT' ? (entry.isInternal ? 'bg-yellow-400' : 'bg-blue-400')
                      : entry.action === 'STATUS_CHANGED' ? 'bg-purple-400'
                      : entry.action === 'ASSIGNED' ? 'bg-green-400'
                      : entry.action === 'RESOLVED' ? 'bg-emerald-500'
                      : entry.action === 'HOLD' ? 'bg-orange-400'
                      : entry.action === 'CREATED' ? 'bg-gray-400'
                      : 'bg-gray-300';
                    return (
                      <div key={entry.id} className="flex gap-3 text-sm">
                        <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${dotColor}`} />
                        <div className="min-w-0">
                          <p className="text-gray-700">
                            <span className="font-medium">{entry.actor.firstName} {entry.actor.lastName}</span>
                          </p>
                          {entry.action === 'STATUS_CHANGED' ? (
                            <p className="text-gray-600">Status changed from <span className="font-medium">{entry.oldValue || '?'}</span> to <span className="font-medium">{entry.newValue || '?'}</span></p>
                          ) : entry.action === 'COMMENT' ? (
                            <>
                              {entry.isInternal && <span className="text-xs text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded">Internal note</span>}
                              <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{entry.comment}</p>
                            </>
                          ) : (
                            <p className="text-gray-600">{entry.comment}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <Link href="/login" className="text-sm text-primary hover:underline">
                Sign in to manage your tickets
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

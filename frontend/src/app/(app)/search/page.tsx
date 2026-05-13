'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { formatDate, getStatusColor } from '../../../lib/utils';
import { TableSkeleton } from '../../../components/ui/Skeleton';

interface TicketResult {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category?: string;
  createdAt: string;
}

interface AssetResult {
  id: string;
  name: string;
  assetType: string;
  serialNumber?: string;
  status: string;
  location?: string;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get('q') || '';
  const [tickets, setTickets] = useState<TicketResult[]>([]);
  const [assets, setAssets] = useState<AssetResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q || q.trim().length < 2) return;
    setLoading(true);
    api.get(`/search?q=${encodeURIComponent(q.trim())}`)
      .then((data) => {
        setTickets(data.tickets || []);
        setAssets(data.assets || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">Search Results</h1>
      {q && <p className="text-sm text-gray-500 mb-6">Showing results for &ldquo;{q}&rdquo;</p>}

      {!q || q.trim().length < 2 ? (
        <p className="text-gray-500">Enter at least 2 characters to search.</p>
      ) : loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <div className="space-y-8">
          {tickets.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Tickets ({tickets.length})</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Ticket</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Title</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/tickets/${t.id}`)}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.ticketNumber}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{t.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{t.category || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>{t.status}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {assets.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Assets ({assets.length})</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Serial</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {assets.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/assets?id=${a.id}`)}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{a.assetType}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{a.serialNumber || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{a.status}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{a.location || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!loading && tickets.length === 0 && assets.length === 0 && (
            <p className="text-gray-500">No results found for &ldquo;{q}&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={5} cols={4} />}>
      <SearchContent />
    </Suspense>
  );
}

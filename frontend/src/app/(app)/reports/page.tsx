'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';

interface TicketSummary { total: number; byStatus: { status: string; _count: number }[]; byPriority: { priority: string; _count: number }[] }
interface SlaCompliance { total: number; compliant: number; rate: number }
interface TechPerf { id: string; name: string; resolvedTickets: number; avgResolutionTime: number; totalDispatches: number }
interface AssetInv { assetType: string; _count: number }

export default function ReportsPage() {
  const [tab, setTab] = useState<'tickets' | 'sla' | 'technician' | 'assets'>('tickets');
  const [ticketSummary, setTicketSummary] = useState<TicketSummary | null>(null);
  const [sla, setSla] = useState<SlaCompliance | null>(null);
  const [techPerf, setTechPerf] = useState<TechPerf[]>([]);
  const [assetInv, setAssetInv] = useState<AssetInv[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const router = useRouter();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    setLoading(true);
    const fetches: Record<string, Promise<any>> = {
      tickets: api.get('/reports/tickets'),
      sla: api.get('/reports/sla'),
      technician: api.get('/reports/technician'),
      assets: api.get('/reports/assets'),
    };
    Promise.all([fetches[tab]]).then(([data]) => {
      if (tab === 'tickets') setTicketSummary(data);
      if (tab === 'sla') setSla(data);
      if (tab === 'technician') setTechPerf(data || []);
      if (tab === 'assets') setAssetInv(data || []);
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [tab, router]);

  const tabs = [
    { key: 'tickets' as const, label: 'Tickets' },
    ...(isAdmin ? [{ key: 'sla' as const, label: 'SLA Compliance' }] : []),
    ...(isAdmin ? [{ key: 'technician' as const, label: 'Technician Performance' }] : []),
    { key: 'assets' as const, label: 'Asset Inventory' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> : (
        <>
          {tab === 'tickets' && ticketSummary && (
            <div className="space-y-6">
              <Link href="/tickets" className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                <h2 className="text-lg font-semibold mb-2">Total Tickets: <span className="text-primary text-2xl">{ticketSummary.total}</span></h2>
              </Link>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">By Status</h3>
                  <div className="space-y-3">
                    {ticketSummary.byStatus.map((s) => (
                      <Link key={s.status} href={`/tickets?status=${s.status}`}
                        className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors">
                        <span className="text-sm text-gray-600">{s.status}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-primary rounded" style={{ width: `${Math.max((s._count / Math.max(ticketSummary.total, 1)) * 200, 4)}px` }} />
                          <span className="text-sm font-medium w-8 text-right">{s._count}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">By Priority</h3>
                  <div className="space-y-3">
                    {ticketSummary.byPriority.map((p) => (
                      <Link key={p.priority} href={`/tickets?priority=${p.priority}`}
                        className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors">
                        <span className="text-sm text-gray-600">{p.priority}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-orange-400 rounded" style={{ width: `${Math.max((p._count / Math.max(ticketSummary.total, 1)) * 200, 4)}px` }} />
                          <span className="text-sm font-medium w-8 text-right">{p._count}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'sla' && sla && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">SLA Compliance</h2>
              <div className="grid grid-cols-3 gap-6 mb-6">
                <Link href="/tickets" className="text-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors block">
                  <p className="text-3xl font-bold text-gray-900">{sla.total}</p>
                  <p className="text-sm text-gray-500">Total Resolved</p>
                </Link>
                <Link href="/tickets?status=RESOLVED" className="text-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors block">
                  <p className="text-3xl font-bold text-green-600">{sla.compliant}</p>
                  <p className="text-sm text-green-600">Compliant</p>
                </Link>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-3xl font-bold text-blue-600">{sla.rate.toFixed(1)}%</p>
                  <p className="text-sm text-blue-600">Compliance Rate</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'technician' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Technician</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Resolved Tickets</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Avg Resolution (min)</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total Dispatches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {techPerf.map((t) => (
                    <tr key={t.id} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => router.push('/dispatch')}>
                      <td className="px-6 py-4 text-sm font-medium text-blue-600 hover:underline">{t.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{t.resolvedTickets}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{t.avgResolutionTime}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{t.totalDispatches}</td>
                    </tr>
                  ))}
                  {techPerf.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No technician data</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'assets' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Asset Type</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {assetInv.map((a) => (
                    <tr key={a.assetType} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => router.push(`/assets?assetType=${a.assetType}`)}>
                      <td className="px-6 py-4 text-sm font-medium text-blue-600 hover:underline">{a.assetType}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{a._count}</td>
                    </tr>
                  ))}
                  {assetInv.length === 0 && <tr><td colSpan={2} className="px-6 py-8 text-center text-gray-500">No assets found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

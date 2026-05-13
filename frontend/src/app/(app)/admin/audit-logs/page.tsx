'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';
import { Pagination } from '../../../../components/ui/Pagination';
import { TableSkeleton } from '../../../../components/ui/Skeleton';
import { ResponsiveTable } from '../../../../components/ui/ResponsiveTable';
import { formatDate } from '../../../../lib/utils';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return; }
    setLoading(true);
    const params = `?page=${page}&limit=25${search ? `&search=${encodeURIComponent(search)}` : ''}`;
    api.get(`/admin/audit-logs${params}`).then((d) => { setLogs(d.data || []); setMeta(d.meta); }).catch(() => {}).finally(() => setLoading(false));
  }, [page, search, user, router]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <div className="mb-4"><input placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm" /></div>
      {loading ? <TableSkeleton rows={8} cols={6} /> : (
        <ResponsiveTable>
          <table className="w-full bg-white rounded-lg shadow overflow-hidden">
            <thead className="bg-gray-50"><tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Resource</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Resource ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{l.action}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{l.resourceType}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">{l.resourceId?.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-sm">{l.actor?.firstName} {l.actor?.lastName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{l.company?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No audit logs found</td></tr>}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
      <Pagination page={meta.page} totalPages={meta.totalPages} onPage={setPage} />
    </div>
  );
}

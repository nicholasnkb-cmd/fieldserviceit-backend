'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';

interface Company {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logo?: string;
  isActive: boolean;
  inviteCode?: string;
  _count: { users: number; tickets: number; assets: number };
  createdAt: string;
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', slug: '', domain: '' });
  const [message, setMessage] = useState('');
  const { user } = useAuthStore();
  const router = useRouter();

  const fetchCompanies = useCallback(() => {
    api.get('/admin/companies')
      .then((data) => setCompanies(data.data || []))
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
      return;
    }
    fetchCompanies();
  }, [user, router, fetchCompanies]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/companies', newCompany);
      setMessage('Company created successfully');
      setShowCreate(false);
      setNewCompany({ name: '', slug: '', domain: '' });
      fetchCompanies();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleInviteCode = async (companyId: string) => {
    try {
      const data = await api.post(`/admin/companies/${companyId}/invite-code`, {});
      setMessage(`Invite code generated: ${data.inviteCode}`);
      fetchCompanies();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Company Management</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90"
        >
          {showCreate ? 'Cancel' : 'Create Company'}
        </button>
      </div>

      {message && (
        <div className="bg-green-50 text-green-600 p-3 rounded text-sm mb-4">{message}</div>
      )}

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Company</h2>
          <form onSubmit={handleCreate} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                required
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Slug</label>
              <input
                type="text"
                required
                value={newCompany.slug}
                onChange={(e) => setNewCompany({ ...newCompany, slug: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Domain (optional)</label>
              <input
                type="text"
                value={newCompany.domain}
                onChange={(e) => setNewCompany({ ...newCompany, domain: e.target.value })}
                placeholder="company.com"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90"
            >
              Create
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Slug</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Domain</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Users</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tickets</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assets</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invite Code</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{c.slug}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{c.domain || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{c._count.users}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{c._count.tickets}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{c._count.assets}</td>
                <td className="px-6 py-4 text-sm font-mono text-gray-600">{c.inviteCode || '-'}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleInviteCode(c.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    Generate invite
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

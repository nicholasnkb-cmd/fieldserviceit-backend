'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  userType: string;
  isActive: boolean;
  company?: { id: string; name: string };
  lastLoginAt?: string;
  createdAt: string;
}

interface Company { id: string; name: string }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [newRole, setNewRole] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'CLIENT', companyId: '' });
  const [message, setMessage] = useState('');
  const { user } = useAuthStore();
  const router = useRouter();

  const fetchUsers = useCallback(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get(`/admin/users${params}`)
      .then((data) => setUsers(data.data || []))
      .catch(() => router.push('/login'));
  }, [search, router]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return; }
    Promise.all([api.get('/admin/users'), api.get('/admin/companies')]).then(([u, c]) => {
      setUsers(u.data || []);
      setCompanies(c.data || []);
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [router, user]);

  const handleRoleChange = async (userId: string) => {
    try { await api.patch(`/admin/users/${userId}/role`, { role: newRole }); setMessage('Role updated'); setEditing(null); fetchUsers(); }
    catch (err: any) { setMessage(err.message); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post('/admin/users', createForm); setMessage('User created'); setShowCreate(false); setCreateForm({ email: '', password: '', firstName: '', lastName: '', role: 'CLIENT', companyId: '' }); fetchUsers(); }
    catch (err: any) { setMessage(err.message); }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this user? They will be deactivated.')) return;
    try { await api.delete(`/admin/users/${userId}`); setMessage('User deleted'); fetchUsers(); }
    catch (err: any) { setMessage(err.message); }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">User Management</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">
          {showCreate ? 'Cancel' : 'Create User'}
        </button>
      </div>

      {message && <div className={`p-3 rounded text-sm mb-4 ${message.includes('Error') || message.includes('Failed') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>}

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create User</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4 max-w-lg">
            <div><label className="block text-sm font-medium text-gray-700">First Name *</label>
              <input type="text" required value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Last Name *</label>
              <input type="text" required value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700">Email *</label>
              <input type="email" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Password *</label>
              <input type="password" required minLength={6} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Role</label>
              <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="CLIENT">CLIENT</option>
                <option value="TECHNICIAN">TECHNICIAN</option>
                <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                <option value="READ_ONLY">READ_ONLY</option>
              </select></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700">Company *</label>
              <select required value={createForm.companyId} onChange={(e) => setCreateForm({ ...createForm, companyId: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select company...</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="col-span-2">
              <button type="submit" className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">Create</button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4">
        <input type="text" placeholder="Search users by name or email..." value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
          className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Active</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${u.userType === 'BUSINESS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{u.userType}</span>
                </td>
                <td className="px-4 py-3">
                  {editing === u.id ? (
                    <div className="flex gap-1">
                      <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="text-xs rounded border px-1 py-0.5">
                        <option value="CLIENT">CLIENT</option>
                        <option value="TECHNICIAN">TECHNICIAN</option>
                        <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        <option value="READ_ONLY">READ_ONLY</option>
                      </select>
                      <button onClick={() => handleRoleChange(u.id)} className="text-xs text-primary">Save</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-500">X</button>
                    </div>
                  ) : (
                    <span className="text-sm">{u.role}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.company?.name || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u.isActive ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(u.id); setNewRole(u.role); }} className="text-xs text-primary hover:underline">Role</button>
                    <button onClick={() => handleDelete(u.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

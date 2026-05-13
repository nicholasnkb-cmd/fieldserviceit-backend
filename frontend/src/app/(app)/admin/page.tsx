'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';

interface GlobalStats {
  totalUsers: number;
  totalCompanies: number;
  totalTickets: number;
  totalAssets: number;
  usersByType: { userType: string; _count: number }[];
  ticketsByStatus: { status: string; _count: number }[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
      return;
    }
    api.get('/admin/stats')
      .then(setStats)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [user, router]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!stats) return null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="flex gap-3 mb-6">
        <a href="/admin/users" className="px-4 py-2 bg-primary/10 text-primary text-sm rounded-md hover:bg-primary/20 transition-colors">User Management</a>
        <a href="/admin/companies" className="px-4 py-2 bg-primary/10 text-primary text-sm rounded-md hover:bg-primary/20 transition-colors">Company Management</a>
        <a href="/admin/roles" className="px-4 py-2 bg-primary/10 text-primary text-sm rounded-md hover:bg-primary/20 transition-colors">Roles</a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Users</h3>
          <p className="text-3xl font-bold mt-2">{stats.totalUsers}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Companies</h3>
          <p className="text-3xl font-bold mt-2">{stats.totalCompanies}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Tickets</h3>
          <p className="text-3xl font-bold mt-2">{stats.totalTickets}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Assets</h3>
          <p className="text-3xl font-bold mt-2">{stats.totalAssets}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Users by Type</h2>
          {stats.usersByType.map((t) => (
            <div key={t.userType} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">{t.userType}</span>
              <span className="text-sm font-medium">{t._count}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Tickets by Status</h2>
          {stats.ticketsByStatus.map((s) => (
            <div key={s.status} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">{s.status}</span>
              <span className="text-sm font-medium">{s._count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

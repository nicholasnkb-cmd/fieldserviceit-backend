'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';

interface Permission {
  id: string;
  name: string;
  slug: string;
  group: string;
  description: string;
}

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { router.push('/dashboard'); return; }
    api.get('/admin/permissions')
      .then(setPermissions)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router, user]);

  const groups = [...new Set(permissions.map((p) => p.group))].filter(Boolean);

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">System Permissions</h1>
      {groups.map((group) => {
        const groupPerms = permissions.filter((p) => p.group === group);
        return (
          <div key={group} className="bg-white rounded-lg shadow mb-4">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 uppercase">{group}</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {groupPerms.map((perm) => (
                <div key={perm.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{perm.name}</p>
                    {perm.description && <p className="text-xs text-gray-500">{perm.description}</p>}
                  </div>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{perm.slug}</code>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

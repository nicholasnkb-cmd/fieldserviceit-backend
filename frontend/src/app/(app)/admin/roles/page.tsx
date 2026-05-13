'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';
import { useToast } from '../../../../components/ui/Toast';

interface Permission {
  id: string;
  name: string;
  slug: string;
  group: string;
}

interface RolePermission {
  permission: Permission;
}

interface Role {
  id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  companyId: string | null;
  permissions: RolePermission[];
  _count: { userRoles: number };
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', slug: '', description: '', permissionSlugs: [] as string[] });
  const { user } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'TENANT_ADMIN') { router.push('/dashboard'); return; }
    Promise.all([
      api.get('/admin/permissions'),
      api.get('/admin/roles'),
    ]).then(([permsData, rolesData]) => {
      setPermissions(permsData);
      setRoles(rolesData);
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [router, user]);

  const toggleExpand = (roleId: string) => {
    setExpandedRole(expandedRole === roleId ? null : roleId);
    setEditing(null);
  };

  const startEdit = (role: Role) => {
    setEditing(role.id);
    setEditPerms(role.permissions.map((rp) => rp.permission.slug));
    setExpandedRole(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditPerms([]);
  };

  const saveEdit = async (roleId: string) => {
    setSaving(true);
    try {
      const updated = await api.patch(`/admin/roles/${roleId}`, { permissionSlugs: editPerms });
      setRoles(roles.map((r) => (r.id === roleId ? updated : r)));
      setEditing(null);
      toast('success', 'Permissions updated');
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api.post('/admin/roles', newRole);
      setRoles([...roles, created]);
      setShowCreate(false);
      setNewRole({ name: '', slug: '', description: '', permissionSlugs: [] });
      toast('success', 'Role created');
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm('Delete this role? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/roles/${roleId}`);
      setRoles(roles.filter((r) => r.id !== roleId));
      toast('success', 'Role deleted');
    } catch (err: any) {
      toast('error', err.message);
    }
  };

  const togglePermission = (slug: string) => {
    setEditPerms((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug],
    );
  };

  const groups = [...new Set(permissions.map((p) => p.group))].filter(Boolean);
  const groupedPermissions: Record<string, Permission[]> = {};
  for (const p of permissions) {
    const group = p.group || 'Other';
    if (!groupedPermissions[group]) groupedPermissions[group] = [];
    groupedPermissions[group].push(p);
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Role & Permission Management</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">
          {showCreate ? 'Cancel' : 'Create Role'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Role</h2>
          <form onSubmit={createRole} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Slug</label>
                <input type="text" value={newRole.slug} onChange={(e) => setNewRole({ ...newRole, slug: e.target.value })}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input type="text" value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Role'}
            </button>
          </form>
        </div>
      )}

      {roles.map((role) => (
        <div key={role.id} className="bg-white rounded-lg shadow mb-4">
          <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50"
            onClick={() => toggleExpand(role.id)}>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-1 rounded text-xs font-medium ${role.isSystem ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                {role.name}
              </span>
              <span className="text-xs text-gray-500">{role.slug}</span>
              <span className="text-xs text-gray-400">{role._count.userRoles} users</span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => startEdit(role)}
                className="text-xs text-primary hover:underline">Edit Permissions</button>
              {!role.isSystem && (
                <button onClick={() => deleteRole(role.id)}
                  className="text-xs text-red-500 hover:underline">Delete</button>
              )}
              <span className="text-gray-400 text-lg">{expandedRole === role.id ? '−' : '+'}</span>
            </div>
          </div>

          {expandedRole === role.id && (
            <div className="px-6 pb-4 border-t border-gray-100 pt-3">
              {role.description && <p className="text-sm text-gray-600 mb-3">{role.description}</p>}
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((rp) => (
                  <span key={rp.permission.id}
                    className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    {rp.permission.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {editing === role.id && (
            <div className="px-6 pb-4 border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Toggle permissions for "{role.name}":</p>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {groups.map((group) => (
                  <div key={group}>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{group}</h4>
                    <div className="flex flex-wrap gap-2">
                      {groupedPermissions[group]?.map((perm) => (
                        <label key={perm.id} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={editPerms.includes(perm.slug)}
                            onChange={() => togglePermission(perm.slug)}
                            className="rounded border-gray-300 text-primary focus:ring-primary" />
                          <span className="text-xs text-gray-700">{perm.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => saveEdit(role.id)} disabled={saving}
                  className="px-3 py-1.5 bg-primary text-white text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={cancelEdit}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

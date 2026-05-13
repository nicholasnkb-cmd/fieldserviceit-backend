'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.get('/users/me').then((d) => { setProfile(d); setForm({ firstName: d.firstName, lastName: d.lastName, phone: d.phone || '' }); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await api.patch('/users/me', form); toast('success', 'Profile updated'); } catch (err: any) { toast('error', err.message); }
    finally { setSaving(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setPwSaving(true);
    try { await api.post('/users/me/change-password', pw); toast('success', 'Password changed'); setPw({ oldPassword: '', newPassword: '' }); } catch (err: any) { toast('error', err.message); }
    finally { setPwSaving(false); }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Account Info</h2>
        <p className="text-sm text-gray-600 mb-4">Email: <span className="font-medium">{profile?.email}</span> &middot; Role: <span className="font-medium">{profile?.role}</span></p>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700">First Name</label>
              <input value={form.firstName} onChange={(e) => setForm({...form, firstName: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input value={form.lastName} onChange={(e) => setForm({...form, lastName: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </form>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        <form onSubmit={changePassword} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input type="password" required value={pw.oldPassword} onChange={(e) => setPw({...pw, oldPassword: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-gray-700">New Password</label>
            <input type="password" required minLength={6} value={pw.newPassword} onChange={(e) => setPw({...pw, newPassword: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          <button type="submit" disabled={pwSaving} className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">{pwSaving ? 'Changing...' : 'Change Password'}</button>
        </form>
      </div>
    </div>
  );
}

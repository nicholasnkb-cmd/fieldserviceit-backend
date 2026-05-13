'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', domain: '', logo: '' });
  const [branding, setBranding] = useState({ primaryColor: '#2563eb', logoUrl: '', companyName: '' });
  const { user } = useAuthStore();
  const router = useRouter();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.userType !== 'BUSINESS') { router.push('/my-tickets'); return; }
    api.get('/settings').then((data) => {
      setSettings(data);
      setForm({ name: data.name || '', domain: data.domain || '', logo: data.logo || '' });
      setBranding({
        primaryColor: data.branding?.primaryColor || '#2563eb',
        logoUrl: data.branding?.logoUrl || '',
        companyName: data.branding?.companyName || data.name || '',
      });
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [router, user]);

  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/settings', form);
      setMessage('Settings saved');
    } catch (err: any) { setMessage(err.message); }
    finally { setSaving(false); }
  };

  const saveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings/branding', branding);
      setMessage('Branding saved');
    } catch (err: any) { setMessage(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Company Settings</h1>
      {message && <div className="bg-green-50 text-green-600 p-3 rounded text-sm mb-4">{message}</div>}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">General</h2>
        {isAdmin ? (
          <form onSubmit={saveGeneral} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Domain</label>
              <input type="text" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Logo URL</label>
              <input type="url" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-sm text-gray-600">
            <p>Company Name: <span className="font-medium text-gray-900">{form.name || '-'}</span></p>
            <p>Domain: <span className="font-medium text-gray-900">{form.domain || '-'}</span></p>
            {form.logo && <p>Logo URL: <span className="font-medium text-gray-900">{form.logo}</span></p>}
            <p className="text-xs text-gray-400 italic mt-2">Only administrators can edit these settings.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Branding</h2>
        {isAdmin ? (
          <form onSubmit={saveBranding} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input type="text" value={branding.companyName} onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Color</label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="h-9 w-9 rounded border border-gray-300 cursor-pointer" />
                <input type="text" value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Logo URL</label>
              <input type="url" value={branding.logoUrl} onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Branding'}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-sm text-gray-600">
            <p>Display Name: <span className="font-medium text-gray-900">{branding.companyName || '-'}</span></p>
            <p>Primary Color: <span className="font-medium text-gray-900">{branding.primaryColor}</span></p>
            {branding.logoUrl && <p>Logo: <span className="font-medium text-gray-900">{branding.logoUrl}</span></p>}
            <p className="text-xs text-gray-400 italic mt-2">Only administrators can edit branding.</p>
          </div>
        )}
      </div>

      {settings?.settings && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Preferences</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p>Timezone: <span className="font-medium">{settings.settings.timezone || 'UTC'}</span></p>
            <p>Locale: <span className="font-medium">{settings.settings.locale || 'en-US'}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}

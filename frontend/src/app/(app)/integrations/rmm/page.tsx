'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/authStore';
import { useToast } from '../../../../components/ui/Toast';

interface RmmConfig {
  id: string;
  provider: string;
  isActive: boolean;
  syncIntervalMin: number;
  lastSyncAt: string | null;
  createdAt: string;
}

export default function RmmIntegrationPage() {
  const [providers, setProviders] = useState<string[]>([]);
  const [configs, setConfigs] = useState<RmmConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [syncInterval, setSyncInterval] = useState(60);
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.userType !== 'BUSINESS') { router.push('/my-tickets'); return; }
    Promise.all([
      api.get('/integrations/rmm/providers'),
      api.get('/integrations/rmm/configs'),
    ]).then(([provData, configData]) => {
      setProviders(provData.providers);
      setConfigs(configData);
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [router, user]);

  const openConfig = (provider: string) => {
    const existing = configs.find((c) => c.provider === provider);
    setShowConfig(provider);
    setConfigForm({});
    setSyncInterval(existing?.syncIntervalMin || 60);
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showConfig) return;
    setSaving(true);
    try {
      const saved = await api.post(`/integrations/rmm/configs`, {
        provider: showConfig,
        credentials: configForm,
        syncIntervalMin: syncInterval,
      });
      setConfigs((prev) => {
        const idx = prev.findIndex((c) => c.provider === showConfig);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = saved;
          return updated;
        }
        return [...prev, saved];
      });
      setShowConfig(null);
      toast('success', 'RMM configuration saved');
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeConfig = async (provider: string) => {
    if (!confirm(`Deactivate ${provider} configuration?`)) return;
    try {
      await api.delete(`/integrations/rmm/configs/${provider}`);
      setConfigs(configs.filter((c) => c.provider !== provider));
      toast('success', 'Configuration deactivated');
    } catch (err: any) {
      toast('error', err.message);
    }
  };

  const syncNow = async (provider: string) => {
    setSyncing(provider);
    try {
      const result = await api.post(`/integrations/rmm/sync-now/${provider}`, {});
      if (result.synced) {
        toast('success', `Sync triggered for ${provider}`);
        const configsUpdated = await api.get('/integrations/rmm/configs');
        setConfigs(configsUpdated);
      } else {
        toast('error', result.error || 'Sync failed');
      }
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSyncing(null);
    }
  };

  const providerLabels: Record<string, string> = {
    connectwise: 'ConnectWise',
    datto: 'Datto',
    ninjaone: 'NinjaOne',
  };

  const credentialFields: Record<string, { key: string; label: string; type?: string }[]> = {
    connectwise: [
      { key: 'companyId', label: 'Company ID' },
      { key: 'publicKey', label: 'Public Key' },
      { key: 'privateKey', label: 'Private Key', type: 'password' },
      { key: 'clientId', label: 'Client ID' },
    ],
    datto: [
      { key: 'apiToken', label: 'API Token', type: 'password' },
      { key: 'siteId', label: 'Site ID' },
    ],
    ninjaone: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'instanceUrl', label: 'Instance URL' },
    ],
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">RMM Integrations</h1>

      <div className="grid gap-4 mb-8">
        {providers.map((provider) => {
          const config = configs.find((c) => c.provider === provider);
          return (
            <div key={provider} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{providerLabels[provider] || provider}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {config
                      ? `Configured ${config.isActive ? '(active)' : '(inactive)'} — Sync every ${config.syncIntervalMin}min`
                      : 'Not configured'}
                  </p>
                  {config?.lastSyncAt && (
                    <p className="text-xs text-gray-400">Last sync: {new Date(config.lastSyncAt).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openConfig(provider)}
                    className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90">
                    {config ? 'Edit' : 'Configure'}
                  </button>
                  {config && (
                    <>
                      <button onClick={() => syncNow(provider)} disabled={syncing === provider}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50">
                        {syncing === provider ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button onClick={() => removeConfig(provider)}
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100">Remove</button>
                    </>
                  )}
                </div>
              </div>

              {showConfig === provider && (
                <form onSubmit={saveConfig} className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  {credentialFields[provider]?.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                      <input type={field.type || 'text'} value={configForm[field.key] || ''}
                        onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                        className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Sync Interval (minutes)</label>
                    <input type="number" min={5} value={syncInterval}
                      onChange={(e) => setSyncInterval(Number(e.target.value))}
                      className="mt-1 block w-48 rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving}
                      className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                    <button type="button" onClick={() => setShowConfig(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

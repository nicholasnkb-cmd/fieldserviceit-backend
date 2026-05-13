'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/utils';

interface Asset {
  id: string;
  name: string;
  assetType: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  ipAddress?: string;
  status: string;
  createdAt: string;
}

interface AssetDetail extends Asset {
  os?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  macAddress?: string;
  notes?: string;
  tickets?: { id: string; ticketNumber: string; title: string; status: string }[];
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<AssetDetail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', assetType: 'COMPUTER', serialNumber: '', manufacturer: '', model: '', location: '', ipAddress: '', os: '', cpu: '', ram: '', storage: '', notes: '' });
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

  const sortedAssets = useMemo(() => {
    return [...assets].sort((a, b) => {
      const aVal = (a as any)[sort.key];
      const bVal = (b as any)[sort.key];
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [assets, sort]);
  const router = useRouter();

  const fetchAssets = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('assetType', typeFilter);
    api.get(`/assets?${params}`).then((data) => setAssets(data.data || [])).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [search, typeFilter, router]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const viewAsset = async (id: string) => {
    const data = await api.get(`/assets/${id}`);
    setSelected(data);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/assets', form);
      setMessage('Asset created');
      setShowForm(false);
      setForm({ name: '', assetType: 'COMPUTER', serialNumber: '', manufacturer: '', model: '', location: '', ipAddress: '', os: '', cpu: '', ram: '', storage: '', notes: '' });
      fetchAssets();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset?')) return;
    try {
      await api.delete(`/assets/${id}`);
      setSelected(null);
      setMessage('Asset deleted');
      fetchAssets();
    } catch (err: any) { setMessage(err.message); }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  const assetTypes = ['COMPUTER', 'SERVER', 'PRINTER', 'SWITCH', 'IP_PHONE', 'CLOUD_INSTANCE', 'NETWORK_DEVICE', 'VIRTUAL_MACHINE', 'OTHER'];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Assets</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">
          {showForm ? 'Cancel' : 'Add Asset'}
        </button>
      </div>

      {message && <div className="bg-green-50 text-green-600 p-3 rounded text-sm mb-4">{message}</div>}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Asset</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm">
                {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select defaultValue="active" className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700">Serial Number</label>
              <input type="text" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Manufacturer</label>
              <input type="text" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Model</label>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Location</label>
              <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">IP Address</label>
              <input type="text" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">OS</label>
              <input type="text" value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">CPU</label>
              <input type="text" value={form.cpu} onChange={(e) => setForm({ ...form, cpu: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">RAM</label>
              <input type="text" value={form.ram} onChange={(e) => setForm({ ...form, ram: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Storage</label>
              <input type="text" value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
            <div className="col-span-2">
              <button type="submit" className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">Create</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchAssets()}
          className="flex-1 max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setTimeout(fetchAssets, 0); }}
          className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Types</option>
          {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['name', 'assetType', 'location', 'status', 'createdAt'].map((k) => {
                  const labels: Record<string, string> = { name: 'Name', assetType: 'Type', location: 'Location', status: 'Status', createdAt: 'Created' };
                  return (
                  <th key={k} onClick={() => setSort({ key: k, dir: sort.key === k && sort.dir === 'asc' ? 'desc' : 'asc' })}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none">
                    {labels[k]}
                    {sort.key === k && <span className="ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedAssets.map((asset) => (
                <tr key={asset.id}
                  onClick={() => viewAsset(asset.id)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600 hover:underline">{asset.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{asset.assetType}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{asset.location || '-'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${asset.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{asset.status}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(asset.createdAt)}</td>
                </tr>
              ))}
              {assets.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No assets found</td></tr>}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <button onClick={() => handleDelete(selected.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">{selected.assetType}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className="font-medium">{selected.status}</span></div>
                {selected.serialNumber && <div className="col-span-2"><span className="text-gray-500">Serial:</span> <span className="font-medium">{selected.serialNumber}</span></div>}
                {selected.manufacturer && <div><span className="text-gray-500">Manufacturer:</span> <span className="font-medium">{selected.manufacturer}</span></div>}
                {selected.model && <div><span className="text-gray-500">Model:</span> <span className="font-medium">{selected.model}</span></div>}
                {selected.location && <div className="col-span-2"><span className="text-gray-500">Location:</span> <span className="font-medium">{selected.location}</span></div>}
                {selected.ipAddress && <div><span className="text-gray-500">IP:</span> <span className="font-medium">{selected.ipAddress}</span></div>}
                {selected.macAddress && <div><span className="text-gray-500">MAC:</span> <span className="font-medium">{selected.macAddress}</span></div>}
                {selected.os && <div className="col-span-2"><span className="text-gray-500">OS:</span> <span className="font-medium">{selected.os}</span></div>}
                {selected.cpu && <div className="col-span-2"><span className="text-gray-500">CPU:</span> <span className="font-medium">{selected.cpu}</span></div>}
                {selected.ram && <div><span className="text-gray-500">RAM:</span> <span className="font-medium">{selected.ram}</span></div>}
                {selected.storage && <div><span className="text-gray-500">Storage:</span> <span className="font-medium">{selected.storage}</span></div>}
              </div>
              {selected.notes && <div><span className="text-gray-500">Notes:</span><p className="mt-1 text-gray-700">{selected.notes}</p></div>}
              {selected.tickets && selected.tickets.length > 0 && (
                <div><span className="text-gray-500 text-xs font-medium uppercase">Linked Tickets</span>
                  <div className="mt-1 space-y-1">{
                    selected.tickets.map(t => (
                      <div key={t.id} className="text-xs text-blue-600 hover:underline cursor-pointer">{t.ticketNumber} - {t.title}</div>
                    ))
                  }</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

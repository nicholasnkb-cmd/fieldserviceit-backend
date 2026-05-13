'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { formatDate, getStatusColor } from '../../../lib/utils';
import { useAuthStore } from '../../../stores/authStore';
import { connectSocket, disconnectSocket, onSocketEvent } from '../../../lib/socket';

interface DispatchItem {
  id: string;
  status: string;
  scheduledAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  notes?: string;
  customerSignature?: string;
  photoUrls: string;
  createdAt: string;
  ticket: { id: string; ticketNumber: string; title: string; priority: string; status: string };
  technician: { id: string; firstName: string; lastName: string; avatarUrl?: string };
}

export default function DispatchPage() {
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DispatchItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticketId: '', technicianId: '' });
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const { user } = useAuthStore();
  const router = useRouter();

  const fetchData = useCallback(() => {
    Promise.all([
      api.get('/dispatch'),
      api.get('/users?limit=100'),
    ]).then(([d, u]) => {
      setDispatches(d || []);
      setUsers(u.data || []);
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (user?.userType === 'PUBLIC') { router.push('/my-tickets'); return; }
    fetchData();
    if (user?.companyId) {
      connectSocket(user.companyId);
    }
    const unsubs: (() => void)[] = [];
    if (user?.companyId) {
      unsubs.push(onSocketEvent('dispatch:created', fetchData));
      unsubs.push(onSocketEvent('dispatch:updated', fetchData));
      unsubs.push(onSocketEvent('dispatch:completed', fetchData));
      unsubs.push(onSocketEvent('ticket:assigned', fetchData));
    }
    return () => { unsubs.forEach((u) => u()); disconnectSocket(); };
  }, [fetchData, user?.companyId, user?.userType, router]);

  const createDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/dispatch', form);
      setMessage('Technician dispatched');
      setShowForm(false);
      setForm({ ticketId: '', technicianId: '' });
      fetchData();
    } catch (err: any) { setMessage(err.message); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/dispatch/${id}`, { status });
      setMessage(`Status updated to ${status}`);
      fetchData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selected) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('photos', f));
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/v1/uploads/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const urls = await uploadRes.json();
      await api.post(`/dispatch/${selected.id}/photos`, { photoUrls: Array.isArray(urls) ? urls : [urls] });
      setMessage('Photos uploaded');
      fetchData();
    } catch (err: any) { setMessage(err.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = sigRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = sigRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const saveSignature = async () => {
    const canvas = sigRef.current;
    if (!canvas || !selected) return;
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const formData = new FormData();
    formData.append('signature', blob, 'signature.png');

    try {
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/v1/uploads/signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const url = await uploadRes.json();
      await api.post(`/dispatch/${selected.id}/signature`, { signature: url });
      setMessage('Signature saved');
      fetchData();
    } catch (err: any) { setMessage(err.message); }
  };

  const saveNotes = async () => {
    if (!selected || !notes.trim()) return;
    try {
      await api.post(`/dispatch/${selected.id}/notes`, { notes });
      setMessage('Notes saved');
      setNotes('');
      fetchData();
    } catch (err: any) { setMessage(err.message); }
  };

  const statusFlow = ['DISPATCHED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'];

  if (loading) return <div className="p-8"><div className="text-gray-500">Loading...</div></div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Field Service</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">
          {showForm ? 'Cancel' : 'New Dispatch'}
        </button>
      </div>

      {message && <div className="bg-green-50 text-green-600 p-3 rounded text-sm mb-4">{message}</div>}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Dispatch Technician</h2>
          <form onSubmit={createDispatch} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700">Ticket ID</label>
              <input type="text" required value={form.ticketId} onChange={(e) => setForm({ ...form, ticketId: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Technician</label>
              <select required value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select technician...</option>
                {users.filter((u: any) => u.role === 'TECHNICIAN' || u.role === 'TENANT_ADMIN').map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90">Dispatch</button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {dispatches.map((d) => (
            <div key={d.id}
              onClick={() => { setSelected(d); setNotes(''); }}
              className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-colors hover:bg-blue-50 ${selected?.id === d.id ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{d.ticket.ticketNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(d.status)}`}>{d.status}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(d.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-700 mb-1">{d.ticket.title}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Technician: {d.technician.firstName} {d.technician.lastName}</span>
                <span>Priority: {d.ticket.priority}</span>
              </div>
            </div>
          ))}
          {dispatches.length === 0 && <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No dispatches</div>}
        </div>

        {selected && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold">Dispatch Details</h2>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Ticket:</span> <span className="font-medium text-blue-600 hover:underline cursor-pointer">{selected.ticket.ticketNumber}</span></div>
              <div><span className="text-gray-500">Title:</span> <span className="font-medium">{selected.ticket.title}</span></div>
              <div><span className="text-gray-500">Technician:</span> <span className="font-medium">{selected.technician.firstName} {selected.technician.lastName}</span></div>
              <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selected.status)}`}>{selected.status}</span></div>
              {selected.arrivedAt && <div><span className="text-gray-500">Arrived:</span> <span className="font-medium">{formatDate(selected.arrivedAt)}</span></div>}
              {selected.completedAt && <div><span className="text-gray-500">Completed:</span> <span className="font-medium">{formatDate(selected.completedAt)}</span></div>}
              {selected.notes && <div><span className="text-gray-500">Notes:</span><p className="mt-1 text-gray-700">{selected.notes}</p></div>}
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {statusFlow.map((s) => (
                  <button key={s} onClick={() => updateStatus(selected.id, s)}
                    disabled={selected.status === s}
                    className={`px-3 py-1 text-xs rounded-full ${selected.status === s ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">Notes</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Add notes..." />
              <button onClick={saveNotes} disabled={!notes.trim()}
                className="mt-1 px-3 py-1 bg-primary text-white text-xs rounded-md hover:bg-primary/90 disabled:opacity-50">Save</button>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">Photos</p>
              <input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="text-xs" />
              {uploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">Signature</p>
              <canvas ref={sigRef} width={300} height={120}
                className="border border-gray-300 rounded bg-white cursor-crosshair"
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} />
              <div className="flex gap-2 mt-2">
                <button onClick={saveSignature} className="px-3 py-1 bg-primary text-white text-xs rounded-md hover:bg-primary/90">Save Signature</button>
                <button onClick={() => { const c = sigRef.current; if (c) { const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height); } }}
                  className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded-md hover:bg-gray-300">Clear</button>
              </div>
              {selected.customerSignature && <img src={selected.customerSignature} alt="Signature" className="mt-2 max-h-16 border rounded" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

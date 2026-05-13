'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { formatDate, getStatusColor } from '../../../../lib/utils';
import { useAuthStore } from '../../../../stores/authStore';
import { connectSocket, disconnectSocket, onSocketEvent } from '../../../../lib/socket';
import { useToast } from '../../../../components/ui/Toast';

const statusFlow = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];

export default function TicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [showHoldInput, setShowHoldInput] = useState(false);
  const [resolution, setResolution] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentIsInternal, setCommentIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [loading, setLoading] = useState(true);

  const { user } = useAuthStore();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const isTech = user?.role === 'TECHNICIAN' || isAdmin;

  useEffect(() => {
    Promise.all([
      api.get(`/tickets/${id}`),
      api.get('/users?limit=100'),
    ]).then(([t, u]) => {
      setTicket(t);
      setUsers(u.data || []);
      setSelectedUser(t.assignedTo?.id || '');
    }).catch(() => router.push('/tickets'))
    .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    if (!user?.companyId) return;
    connectSocket(user.companyId);
    const unsub1 = onSocketEvent('ticket:updated', (data: any) => {
      if (data.id === id) setTicket(data);
    });
    const unsub2 = onSocketEvent('ticket:assigned', (data: any) => {
      if (data.id === id) setTicket(data);
      if (data.assignedToId === user.id) {
        toast('info', `Ticket ${data.ticketNumber} assigned to you`);
      }
    });
    return () => { unsub1(); unsub2(); disconnectSocket(); };
  }, [user?.companyId, user?.id, id, toast]);

  const updateTicket = async (body: any) => {
    try {
      const updated = await api.patch(`/tickets/${id}`, body);
      setTicket(updated);
      toast('success', 'Ticket updated');
    } catch (err: any) {
      toast('error', err.message);
    }
  };

  const changeStatus = (status: string) => {
    if (status === 'ON_HOLD') {
      setShowHoldInput(true);
      return;
    }
    if (status === 'RESOLVED') {
      const res = prompt('Enter resolution notes:');
      if (res === null) return;
      updateTicket({ status, resolution: res, onHoldReason: null });
      return;
    }
    const body: any = { status };
    if (status !== 'ON_HOLD') body.onHoldReason = null;
    updateTicket(body);
  };

  const submitHold = () => {
    if (!holdReason.trim()) {
      toast('error', 'Hold reason is required');
      return;
    }
    updateTicket({ status: 'ON_HOLD', onHoldReason: holdReason });
    setShowHoldInput(false);
    setHoldReason('');
  };

  const assignUser = () => {
    if (!selectedUser) return;
    updateTicket({ assignedToId: selectedUser });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
      const res = await fetch(`${apiUrl}/v1/uploads/ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const urls: string[] = await res.json();
      const newAttachments: any[] = [];
      for (let i = 0; i < urls.length; i++) {
        const att = await api.post(`/tickets/${id}/attachments`, { fileUrl: urls[i], fileName: files[i].name, fileSize: files[i].size, mimeType: files[i].type });
        newAttachments.push(att);
      }
      setTicket((prev: any) => ({ ...prev, attachments: [...(prev.attachments || []), ...newAttachments] }));
      toast('success', `${urls.length} file(s) uploaded`);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setUploadingFiles(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    try {
      await api.delete(`/tickets/${id}/attachments/${attachmentId}`);
      setTicket((prev: any) => ({ ...prev, attachments: prev.attachments?.filter((a: any) => a.id !== attachmentId) }));
      toast('success', 'Attachment removed');
    } catch (err: any) {
      toast('error', err.message);
    }
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const entry = await api.post(`/tickets/${id}/comments`, { comment: commentText, isInternal: commentIsInternal });
      setTicket((prev: any) => ({ ...prev, timeline: [entry, ...(prev.timeline || [])] }));
      setCommentText('');
      toast('success', 'Comment added');
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!ticket) return null;

  const techUsers = users.filter((u: any) =>
    u.role === 'TECHNICIAN' || u.role === 'TENANT_ADMIN'
  );

  return (
    <div className="p-8 max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-primary hover:underline mb-4">&larr; Back</button>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{ticket.ticketNumber}</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>{ticket.status}</span>
        </div>
        <h2 className="text-xl font-semibold mb-6">{ticket.title}</h2>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-6">
          <div><span className="text-gray-500">Priority:</span> <span className="font-medium ml-1">{ticket.priority}</span></div>
          <div><span className="text-gray-500">Type:</span> <span className="font-medium ml-1">{ticket.type || 'Standard'}</span></div>
          <div><span className="text-gray-500">Status:</span> <span className="font-medium ml-1">{ticket.status}</span></div>
          {ticket.contactName && <div className="col-span-full"><span className="text-gray-500">Contact:</span> <span className="font-medium ml-1">{ticket.contactName}</span></div>}
          {ticket.contactEmail && <div><span className="text-gray-500">Email:</span> <span className="font-medium ml-1">{ticket.contactEmail}</span></div>}
          {ticket.contactPhone && <div><span className="text-gray-500">Phone:</span> <span className="font-medium ml-1">{ticket.contactPhone}</span></div>}
          {ticket.category && <div><span className="text-gray-500">Category:</span> <span className="font-medium ml-1">{ticket.category}{ticket.subcategory ? ` / ${ticket.subcategory}` : ''}</span></div>}
          <div><span className="text-gray-500">Created by:</span> <span className="font-medium ml-1">{ticket.createdBy?.firstName} {ticket.createdBy?.lastName}</span></div>
          <div><span className="text-gray-500">Assigned to:</span> <span className="font-medium ml-1">{ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : '-'}</span></div>
          <div><span className="text-gray-500">Created:</span> <span className="font-medium ml-1">{formatDate(ticket.createdAt)}</span></div>
          {ticket.onHoldReason && <div className="col-span-full"><span className="text-gray-500">Hold Reason:</span> <span className="font-medium ml-1">{ticket.onHoldReason}</span></div>}
          {ticket.resolvedAt && <div><span className="text-gray-500">Resolved:</span> <span className="font-medium ml-1">{formatDate(ticket.resolvedAt)}</span></div>}
        </div>

        {ticket.sla && (
          <div className="border-t pt-4 mb-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">SLA</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  ticket.slaStatus === 'breached' ? 'bg-red-500'
                  : ticket.slaStatus === 'at_risk' ? 'bg-orange-400'
                  : 'bg-emerald-500'
                }`} style={{ width: `${Math.min(ticket.slaProgress || 0, 100)}%` }} />
              </div>
              <span className={`text-xs font-medium shrink-0 ${
                ticket.slaStatus === 'breached' ? 'text-red-600'
                : ticket.slaStatus === 'at_risk' ? 'text-orange-500'
                : 'text-emerald-600'
              }`}>
                {ticket.slaStatus === 'breached' ? 'Breached'
                  : ticket.slaStatus === 'at_risk' ? 'At Risk'
                  : 'Within SLA'} ({ticket.slaProgress || 0}%)
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Resolution target: {ticket.sla.resolutionTimeMin} min</p>
          </div>
        )}

        {ticket.attachments && ticket.attachments.length > 0 && (
          <div className="border-t pt-4 mb-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Attachments</h3>
            <div className="flex flex-wrap gap-2">
              {ticket.attachments.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${a.fileUrl}`} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline truncate max-w-[200px]">
                    {a.fileName}
                  </a>
                  {isTech && (
                    <button onClick={() => removeAttachment(a.id)} className="text-gray-400 hover:text-red-500 ml-1">&times;</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isTech && (
          <>
            <div className="border-t pt-4 mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
              <div className="flex flex-wrap gap-2">
                {statusFlow.map((s) => {
                  const allowed = s === ticket.status;
                  return (
                    <button key={s} onClick={() => changeStatus(s)}
                      disabled={ticket.status === s}
                      className={`px-3 py-1 text-xs rounded-full ${
                        ticket.status === s
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      }`}>
                      {s.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
              {showHoldInput && (
                <div className="mt-3 p-3 border border-yellow-300 bg-yellow-50 rounded-md">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Hold</label>
                  <textarea value={holdReason} onChange={(e) => setHoldReason(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    rows={2} placeholder="Explain why this ticket is being put on hold..." />
                  <div className="flex gap-2 mt-2">
                    <button onClick={submitHold}
                      className="px-3 py-1 bg-yellow-500 text-white text-xs rounded-md hover:bg-yellow-600">Submit Hold</button>
                    <button onClick={() => { setShowHoldInput(false); setHoldReason(''); }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded-md hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4 mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Assign To</h3>
              <div className="flex gap-2">
                <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm flex-1">
                  <option value="">Select technician...</option>
                  {techUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role})</option>
                  ))}
                </select>
                <button onClick={assignUser} disabled={!selectedUser || selectedUser === ticket.assignedTo?.id}
                  className="px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
                  Assign
                </button>
              </div>
            </div>

            <div className="border-t pt-4 mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Upload Files</h3>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-sm text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {uploadingFiles ? 'Uploading...' : 'Choose files'}
                <input type="file" multiple onChange={handleFileUpload} disabled={uploadingFiles} className="hidden" accept="image/*,.pdf,.doc,.docx,.txt" />
              </label>
              <p className="text-xs text-gray-400 mt-1">Images, PDF, DOC, TXT (max 10MB each)</p>
            </div>
          </>
        )}

        {ticket.location && (
          <div className="border-t pt-4 mb-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Location</h3>
            <p className="text-sm text-gray-700">{ticket.location}</p>
            {ticket.latitude && ticket.longitude && (
              <a href={`https://maps.google.com/maps?q=${ticket.latitude},${ticket.longitude}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                View on Google Maps
              </a>
            )}
          </div>
        )}

        {ticket.description && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}

        {ticket.resolution && (
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Resolution</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.resolution}</p>
            <p className="text-xs text-gray-400 mt-1">
              Resolved by {ticket.resolvedBy?.firstName} {ticket.resolvedBy?.lastName} on {formatDate(ticket.resolvedAt)}
            </p>
          </div>
        )}

        {isTech && (
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Add Comment</h3>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm" rows={3}
              placeholder="Type your comment..." />
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={commentIsInternal} onChange={(e) => setCommentIsInternal(e.target.checked)}
                  className="rounded border-gray-300" />
                Internal note (visible to staff only)
              </label>
              <button onClick={submitComment} disabled={submittingComment || !commentText.trim()}
                className="px-4 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
                {submittingComment ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {ticket.timeline && ticket.timeline.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Activity</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {ticket.timeline.map((entry: any) => (
                <div key={entry.id} className="flex gap-3 text-sm">
                  <div className="flex-shrink-0 mt-1">
                    <div className={`w-2 h-2 rounded-full ${
                      entry.action === 'COMMENT' ? (entry.isInternal ? 'bg-yellow-400' : 'bg-blue-400')
                      : entry.action === 'STATUS_CHANGED' ? 'bg-purple-400'
                      : entry.action === 'ASSIGNED' ? 'bg-green-400'
                      : entry.action === 'RESOLVED' ? 'bg-emerald-500'
                      : entry.action === 'HOLD' ? 'bg-orange-400'
                      : 'bg-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{entry.actor?.firstName} {entry.actor?.lastName}</span>
                      <span className="text-xs text-gray-400">{formatDate(entry.createdAt)}</span>
                      {entry.isInternal && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Internal</span>}
                    </div>
                    {entry.action === 'COMMENT' ? (
                      <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{entry.comment}</p>
                    ) : entry.action === 'STATUS_CHANGED' ? (
                      <p className="text-gray-600 mt-0.5">
                        Status changed from <span className="font-medium">{entry.oldValue}</span> to <span className="font-medium">{entry.newValue}</span>
                        {entry.comment && ` — ${entry.comment}`}
                      </p>
                    ) : (
                      <p className="text-gray-600 mt-0.5">{entry.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

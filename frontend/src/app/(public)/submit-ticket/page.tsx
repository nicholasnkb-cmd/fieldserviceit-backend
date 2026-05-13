'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { allCategories, categories } from '../../../lib/ticketCategories';

export default function SubmitTicketPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [type, setType] = useState('REQUEST');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ ticketNumber: string; trackingToken?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    if (!contactName.trim()) e.contactName = 'Contact name is required';
    if (!contactEmail.trim()) e.contactEmail = 'Contact email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) e.contactEmail = 'Invalid email format';
    if (!contactPhone.trim()) e.contactPhone = 'Contact phone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!validate()) return;
    setLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const body: any = {
        title, description, priority, type,
        contactName, contactEmail, contactPhone,
      };
      if (category) body.category = category;
      if (subcategory) body.subcategory = subcategory;
      if (location) body.location = location;
      if (latitude) body.latitude = parseFloat(latitude);
      if (longitude) body.longitude = parseFloat(longitude);

      const res = await fetch(`${apiUrl}/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create ticket');
      }

      const data = await res.json();
      setSuccess({ ticketNumber: data.ticketNumber, trackingToken: data.trackingToken });
      setTitle(''); setDescription(''); setContactName(''); setContactEmail(''); setContactPhone('');
      setCategory(''); setSubcategory(''); setLocation(''); setLatitude(''); setLongitude('');
      setPriority('MEDIUM'); setType('REQUEST'); setErrors({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const catOptions = allCategories;
  const subOptions = category ? categories[category] : [];

  return (
    <div className="min-h-[80vh] bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold mb-2">Submit a Service Request</h1>
          <p className="text-sm text-gray-600 mb-6">
            Describe your issue and we&apos;ll get back to you as soon as possible.
          </p>

          {success ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <h3 className="text-lg font-semibold text-green-800 mb-2">Ticket Created!</h3>
              <p className="text-green-700 mb-1">
                Your ticket number is: <strong>{success.ticketNumber}</strong>
              </p>
              {success.trackingToken && (
                <p className="text-sm text-green-600 mb-4">
                  Tracking token: <strong>{success.trackingToken}</strong>
                </p>
              )}
              <button onClick={() => setSuccess(null)} className="text-sm text-primary hover:underline">
                Submit another ticket
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700">Title *</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Brief summary of your request" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contact Name *</label>
                  <input type="text" required value={contactName} onChange={(e) => setContactName(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Affected person's name" />
                  {errors.contactName && <p className="text-red-500 text-xs mt-1">{errors.contactName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contact Email *</label>
                  <input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="email@example.com" />
                  {errors.contactEmail && <p className="text-red-500 text-xs mt-1">{errors.contactEmail}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contact Phone *</label>
                  <input type="tel" required value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="+1 (555) 000-0000" />
                  {errors.contactPhone && <p className="text-red-500 text-xs mt-1">{errors.contactPhone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Select category...</option>
                    {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Sub-category</label>
                  <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!category}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-100">
                    <option value="">Select sub-category...</option>
                    {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Location / Address</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Street address, city, state" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Latitude</label>
                  <input type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="40.7128" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Longitude</label>
                  <input type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="-74.0060" />
                </div>
              </div>
              {latitude && longitude && (
                <a href={`https://maps.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  View on Google Maps
                </a>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Provide details about your request" />
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

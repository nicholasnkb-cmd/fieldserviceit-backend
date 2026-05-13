'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!token) { setError('Missing reset token'); return; }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Reset failed');
      }
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow text-center">
          <h2 className="text-2xl font-bold mb-4">Password Reset</h2>
          <p className="text-gray-600 mb-6">Your password has been reset successfully.</p>
          <Link href="/login" className="text-primary hover:underline">Sign in with new password</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-md space-y-6 p-8 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center">Reset Password</h2>
        {!token && <div className="bg-yellow-50 text-yellow-700 p-3 rounded text-sm">Invalid or missing reset link.</div>}
        {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 6 chars)"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <button type="submit" disabled={!token}
            className="w-full py-2 px-4 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50">
            Reset Password
          </button>
        </form>
        <div className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">Back to login</Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>}>
      <ResetForm />
    </Suspense>
  );
}

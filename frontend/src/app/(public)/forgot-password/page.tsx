'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Request failed');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (sent) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow text-center">
          <h2 className="text-2xl font-bold mb-4">Check Your Email</h2>
          <p className="text-gray-600 mb-6">If an account exists with that email, we&apos;ve sent a password reset link.</p>
          <Link href="/login" className="text-primary hover:underline">Back to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-md space-y-6 p-8 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center">Forgot Password</h2>
        <p className="text-sm text-gray-600 text-center">Enter your email and we&apos;ll send you a reset link.</p>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <button type="submit" className="w-full py-2 px-4 bg-primary text-white text-sm rounded-md hover:bg-primary/90">
            Send Reset Link
          </button>
        </form>
        <div className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">Back to login</Link>
        </div>
      </div>
    </div>
  );
}

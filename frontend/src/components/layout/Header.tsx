'use client';

import Link from 'next/link';
import { useAuthStore } from '../../stores/authStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '../../lib/api';

export function Header() {
  const { user, company, isAuthenticated, setCompany, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user?.companyId && !company) {
      api.get(`/companies/${user.companyId}`)
        .then(setCompany)
        .catch(() => {});
    }
  }, [user?.companyId, company, setCompany]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between h-16 px-6">
        <div className="flex items-center gap-3">
          <Link href={isAuthenticated ? '/dashboard' : '/'} className="text-xl font-bold text-primary">
            <span>{company?.name || 'FieldserviceIT'}</span>
          </Link>
          {company?.name && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              {company.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {user.firstName} {user.lastName}
              </span>
              {user.role && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {user.role}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm text-primary hover:text-primary-700 font-medium"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

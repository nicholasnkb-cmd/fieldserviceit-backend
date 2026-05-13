'use client';

import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { ToastProvider } from '../components/ui/Toast';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { setUser } = useAuthStore();

  useEffect(() => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUser({
            id: payload.sub,
            email: payload.email,
            firstName: '',
            lastName: '',
            role: payload.role,
            userType: payload.userType || 'BUSINESS',
            companyId: payload.companyId || null,
            isActive: true,
            createdAt: new Date().toISOString(),
          });
          api.get('/users/me').then((u) => {
            if (u) setUser(u);
          }).catch(() => {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
          });
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      }
    } catch {
      // localStorage not available
    }
  }, [setUser]);

  return <ToastProvider>{children}</ToastProvider>;
}

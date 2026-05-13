import { create } from 'zustand';
import type { User } from '../types';

interface CompanyInfo {
  id: string;
  name: string;
  logo?: string;
  branding?: string;
}

interface AuthState {
  user: User | null;
  company: CompanyInfo | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  setCompany: (company: CompanyInfo) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  company: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  setCompany: (company) => set({ company }),
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, company: null, isAuthenticated: false });
  },
}));

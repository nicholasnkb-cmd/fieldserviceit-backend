'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../lib/api';
import { DarkModeToggle } from '../ui/DarkModeToggle';

const menuItems: (
  | { label: string; href: string; children?: undefined }
  | { label: string; children: { label: string; href: string }[]; href?: undefined }
)[] = [
  { label: 'Home', href: '/dashboard' },
  {
    label: 'Tickets',
    children: [
      { label: 'Create ticket', href: '/tickets/new' },
      { label: 'View tickets', href: '/tickets' },
    ],
  },
  {
    label: 'Assets',
    children: [
      { label: 'Add assets', href: '/assets/new' },
      { label: 'View assets', href: '/assets' },
    ],
  },
  { label: 'Favorites', href: '/favorites' },
  { label: 'History', href: '/history' },
  { label: 'Dashboards', href: '/dashboards' },
  { label: 'All', href: '/all' },
];

export function BannerMenu() {
  const { user, company, isAuthenticated, logout } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifCount = useCallback(async () => {
    try { const d = await api.get('/notifications/unread-count'); setNotifCount(d.count); } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    try { const d = await api.get('/notifications?limit=10'); setNotifications(d.data || []); } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifCount]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleNotifs = () => {
    setShowNotifs((prev) => {
      if (!prev) fetchNotifications();
      return !prev;
    });
  };

  const markRead = async (id: string) => {
    try { await api.patch(`/notifications/${id}/read`, {}); setNotifCount((c) => Math.max(0, c - 1)); } catch {}
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!isAuthenticated || !user) return null;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/dashboard" className="text-lg font-bold text-primary whitespace-nowrap">
            {company?.name || 'FieldserviceIT'}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1" ref={dropdownRef}>
          {menuItems.map((item) => {
            const isActive = 'href' in item && item.href
              ? pathname === item.href || pathname.startsWith(item.href + '/')
              : false;
            const hasChildren = 'children' in item;
            const isOpen = openDropdown === item.label;

            if (hasChildren) {
              return (
                <div key={item.label} className="relative">
                  <button
                    onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1',
                      isOpen || (item.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + '/')) ?? false)
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    )}
                  >
                    {item.label}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && item.children && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50">
                      {item.children.map((child) => {
                        const isChildActive = pathname === child.href || pathname.startsWith(child.href + '/');
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setOpenDropdown(null)}
                            className={cn(
                              'block px-4 py-2 text-sm transition-colors',
                              isChildActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                            )}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </form>

        {/* User info */}
        <div className="flex items-center gap-3 shrink-0">
          <DarkModeToggle />

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button onClick={toggleNotifs} className="relative p-1.5 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Notifications</span>
                  <button onClick={async () => { try { await api.post('/notifications/read-all', {}); setNotifCount(0); } catch {} }}
                    className="text-xs text-primary hover:underline">Mark all read</button>
                </div>
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400 text-center">No notifications</p>
                ) : (
                  notifications.map((n: any) => (
                    <Link key={n.id} href={n.link || '#'} onClick={() => { if (!n.isRead) markRead(n.id); setShowNotifs(false); }}
                      className={`block p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${n.isRead ? '' : 'bg-blue-50/50'}`}>
                      <div className="flex items-start gap-2">
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.type === 'success' ? 'bg-emerald-400' : n.type === 'error' ? 'bg-red-400' : 'bg-blue-400'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                          {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-[10px] text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <span className="text-sm text-gray-600 hidden sm:inline">
            {user.firstName} {user.lastName}
          </span>
          {user.role && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded hidden sm:inline">
              {user.role}
            </span>
          )}
          <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-700">Profile</Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-t border-gray-200 px-4 py-2 overflow-x-auto flex gap-2">
        {menuItems.map((item) => {
          const href = item.href ?? item.children?.[0]?.href ?? '#';
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 text-sm rounded-md transition-colors',
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

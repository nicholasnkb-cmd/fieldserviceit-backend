'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import { cn } from '../../lib/utils';

const navItems = {
  public: [
    { label: 'My Tickets', href: '/my-tickets', icon: '🎫' },
    { label: 'Submit Ticket', href: '/submit-ticket', icon: '+' },
  ],
  business: [
    { label: 'Dashboard', href: '/dashboard', icon: '📊' },
    { label: 'Tickets', href: '/tickets', icon: '🎫' },
    { label: 'Assets', href: '/assets', icon: '💻' },
    { label: 'Field Service', href: '/dispatch', icon: '🚚' },
    { label: 'Reports', href: '/reports', icon: '📈' },
    { label: 'RMM Integrations', href: '/integrations/rmm', icon: '🔄' },
    { label: 'Settings', href: '/settings', icon: '⚙️' },
  ],
  admin: [
    { label: 'Users', href: '/admin/users', icon: '👥' },
    { label: 'Companies', href: '/admin/companies', icon: '🏢' },
    { label: 'Global Stats', href: '/admin', icon: '📊' },
    { label: 'Audit Logs', href: '/admin/audit-logs', icon: '📋' },
    { label: 'Permissions', href: '/admin/permissions', icon: '🔒' },
    { label: 'Roles', href: '/admin/roles', icon: '🔑' },
  ],
  tenantAdmin: [
    { label: 'Company Users', href: '/admin/company', icon: '👥' },
    { label: 'Roles', href: '/admin/roles', icon: '🔑' },
    { label: 'RMM Integrations', href: '/integrations/rmm', icon: '🔄' },
    { label: 'Settings', href: '/settings', icon: '⚙️' },
  ],
};

export function SidePanel() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  if (!user) return null;

  const items = [
    ...(user.userType === 'PUBLIC' ? navItems.public : navItems.business),
    ...(user.role === 'SUPER_ADMIN' ? navItems.admin : []),
    ...(user.role === 'TENANT_ADMIN' ? navItems.tenantAdmin : []),
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <nav className="flex-1 py-4 px-3 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

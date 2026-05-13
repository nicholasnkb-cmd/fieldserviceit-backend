'use client';

import Link from 'next/link';

const allItems = [
  { label: 'Dashboard', href: '/dashboard', desc: 'Overview and key metrics' },
  { label: 'Tickets', href: '/tickets', desc: 'View and manage tickets' },
  { label: 'Create Ticket', href: '/tickets/new', desc: 'Submit a new ticket' },
  { label: 'Assets', href: '/assets', desc: 'View and manage assets' },
  { label: 'Add Asset', href: '/assets/new', desc: 'Register a new asset' },
  { label: 'Field Service', href: '/dispatch', desc: 'Dispatch board and scheduling' },
  { label: 'Reports', href: '/reports', desc: 'Analytics and reporting' },
  { label: 'Favorites', href: '/favorites', desc: 'Your saved items' },
  { label: 'History', href: '/history', desc: 'Recent activity' },
  { label: 'Settings', href: '/settings', desc: 'Company settings and branding' },
];

export default function AllPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">All</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {allItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold">{item.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';

export default function DashboardsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboards</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/dashboard" className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
          <h2 className="font-semibold text-lg">Main Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Overview of tickets, SLA, and activity</p>
        </Link>
        <Link href="/reports" className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
          <h2 className="font-semibold text-lg">Reports</h2>
          <p className="text-sm text-gray-500 mt-1">Detailed reports and analytics</p>
        </Link>
        <Link href="/dispatch" className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
          <h2 className="font-semibold text-lg">Field Service</h2>
          <p className="text-sm text-gray-500 mt-1">Dispatch board and technician status</p>
        </Link>
      </div>
    </div>
  );
}

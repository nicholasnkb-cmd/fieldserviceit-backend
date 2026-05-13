import { AppLayout } from '../../components/layout/AppLayout';

export const dynamic = 'force-dynamic';

export default function AppRouteLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

import { BannerMenu } from './BannerMenu';
import { SidePanel } from './SidePanel';
import { Footer } from './Footer';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <BannerMenu />
      <div className="flex flex-1">
        <SidePanel />
        <main className="flex-1 bg-gray-50">{children}</main>
      </div>
      <Footer />
    </div>
  );
}

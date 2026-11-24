import Link from 'next/link';
import type { Metadata } from 'next';
import Analytics from '@/components/Analytics';
import Inspector from '@/components/Inspector';
import { CartProvider } from '@/components/Cart';
import { SearchBox, CartLink } from '@/components/StoreBits';
import catalog from '@/lib/catalog.json';

export const metadata: Metadata = { title: 'Halden Nutrition (demo store)' };

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="store">
        <div className="notice">
          Demo store for a product analytics case study. Fictional brand, no real orders or payments.{' '}
          <Link href="/">Back to the analysis</Link>
        </div>
        <header className="shead">
          <div className="wrap">
            <Link href="/store" className="logo">Halden<small>demo</small></Link>
            <SearchBox />
            <CartLink />
          </div>
        </header>
        <div className="wrap">
          <nav className="cats">
            {catalog.categories.map((c) => <Link key={c.id} href={`/store/c/${c.id}`}>{c.name}</Link>)}
          </nav>
          {children}
        </div>
        <Analytics />
        <Inspector />
      </div>
    </CartProvider>
  );
}

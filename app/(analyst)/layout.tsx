import Link from 'next/link';
import Nav from '@/components/Nav';
import results from '@/lib/results.json';

export default function AnalystLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/" className="brandmark"><i />Funnel Intelligence</Link>
          <Nav />
          <span className="spacer" />
          <Link href="/store" className="btn">Open the live store ↗</Link>
        </div>
      </header>
      <main className="wrap page">{children}</main>
      <footer className="wrap foot">
        <p>
          Independent portfolio project by {process.env.NEXT_PUBLIC_AUTHOR_NAME || 'Ankit Yadav'}. Halden Nutrition is a fictional store. The 90-day history
          ({results.period.start} to {results.period.end}) is synthetic, generated with planted problems so the analysis can be
          checked against a known answer. The storefront, data layer and integrations are real and live.
        </p>
      </footer>
    </>
  );
}

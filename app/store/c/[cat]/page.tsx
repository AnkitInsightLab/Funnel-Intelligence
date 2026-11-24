import { notFound } from 'next/navigation';
import catalog from '@/lib/catalog.json';
import { ProductCard } from '@/components/StoreBits';

export function generateStaticParams() { return catalog.categories.map((c) => ({ cat: c.id })); }

export default async function Category({ params }: { params: Promise<{ cat: string }> }) {
  const { cat } = await params;
  const c = catalog.categories.find((x) => x.id === cat);
  if (!c) notFound();
  return (
    <div style={{ padding: '8px 0 80px' }}>
      <h1>{c.name}</h1>
      <div className="pgrid">
        {catalog.products.filter((p) => p.category === cat).map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

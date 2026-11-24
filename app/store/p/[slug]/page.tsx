import { notFound } from 'next/navigation';
import catalog from '@/lib/catalog.json';
import ProductDetail from '@/components/ProductDetail';

export function generateStaticParams() { return catalog.products.map((p) => ({ slug: p.slug })); }

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = catalog.products.find((x) => x.slug === slug);
  if (!p) notFound();
  return <ProductDetail id={p.id} />;
}

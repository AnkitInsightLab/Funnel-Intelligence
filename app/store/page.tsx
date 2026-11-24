import catalog from '@/lib/catalog.json';
import { ProductCard } from '@/components/StoreBits';

export default function StoreHome() {
  return (
    <div style={{ padding: '8px 0 80px' }}>
      <section style={{ background: '#1f4d3a', color: '#fff', borderRadius: 14, padding: '28px 24px', margin: '4px 0 22px' }}>
        <h1 style={{ margin: 0 }}>Lab-tested supplements, honest labels.</h1>
        <p style={{ opacity: 0.85, margin: '8px 0 0', maxWidth: 560 }}>
          Every batch third-party tested. Free delivery over ₹499.
        </p>
      </section>
      <h2>Bestsellers</h2>
      <div className="pgrid">
        {catalog.products.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

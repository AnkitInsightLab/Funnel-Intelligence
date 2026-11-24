'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useCart, inr, Tub, type Product } from './Cart';

function SearchInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  return (
    <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/store/search?q=${encodeURIComponent(q.trim())}`); }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search whey, creatine, gainer…" aria-label="Search products" />
      <button type="submit">Search</button>
    </form>
  );
}
export function SearchBox() { return <Suspense fallback={<form className="search" />}><SearchInner /></Suspense>; }

export function CartLink() {
  const { count } = useCart();
  return <Link href="/store/cart" className="cartlink">Cart ({count})</Link>;
}

export function ProductCard({ p }: { p: Product }) {
  return (
    <Link href={`/store/p/${p.slug}`} className="pcard">
      <div className="tub"><Tub color={p.color} /></div>
      <div className="name">{p.name}</div>
      <div><span className="price">{inr(p.price)}</span><span className="mrp">{inr(p.mrp)}</span></div>
      <div className="small" style={{ color: '#64625d' }}>★ {p.rating} · {p.reviews.toLocaleString('en-IN')} reviews</div>
    </Link>
  );
}

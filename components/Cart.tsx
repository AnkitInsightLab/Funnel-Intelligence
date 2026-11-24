'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import catalog from '@/lib/catalog.json';

export type Product = (typeof catalog.products)[number];
export interface Line { id: string; qty: number }
interface CartCtx { lines: Line[]; add: (id: string, qty?: number) => void; setQty: (id: string, qty: number) => void; clear: () => void; count: number }

const Ctx = createContext<CartCtx | null>(null);
export const productById = (id: string) => catalog.products.find((p) => p.id === id)!;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => { try { setLines(JSON.parse(localStorage.getItem('hn_cart') || '[]')); } catch { /* empty cart */ } }, []);
  const save = (l: Line[]) => { setLines(l); try { localStorage.setItem('hn_cart', JSON.stringify(l)); } catch { /* storage off */ } };
  const value: CartCtx = {
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    add: (id, qty = 1) => {
      const ex = lines.find((l) => l.id === id);
      save(ex ? lines.map((l) => (l.id === id ? { ...l, qty: l.qty + qty } : l)) : [...lines, { id, qty }]);
    },
    setQty: (id, qty) => save(qty <= 0 ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, qty } : l))),
    clear: () => save([]),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}

export function cartTotals(lines: Line[]) {
  const items = lines.map((l) => ({ ...l, p: productById(l.id) })).filter((x) => x.p);
  const subtotal = items.reduce((s, x) => s + x.p.price * x.qty, 0);
  const heavy = items.some((x) => x.p.weightKg >= catalog.heavyShippingFee.minWeightKg);
  const delivery = heavy ? catalog.heavyShippingFee.fee : subtotal >= 499 || subtotal === 0 ? 0 : 49;
  return { items, subtotal, heavy, delivery, total: subtotal + delivery };
}

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function Tub({ color, size = 120, label }: { color: string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <rect x="30" y="18" width="60" height="12" rx="4" fill="#2a2a2a" opacity=".85" />
      <rect x="26" y="28" width="68" height="78" rx="10" fill={color} />
      <rect x="32" y="50" width="56" height="30" rx="4" fill="#fff" opacity=".92" />
      <text x="60" y="69" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1b1c1e" fontFamily="sans-serif">{label ?? 'HALDEN'}</text>
    </svg>
  );
}

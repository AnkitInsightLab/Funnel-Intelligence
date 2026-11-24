// Demo coupons. FIT15 needs ₹1,499 in the cart. DIWALI20 has expired.
export const COUPONS: Record<string, { pct: number; min: number; expired?: boolean }> = {
  FIRST10: { pct: 10, min: 0 },
  FIT15: { pct: 15, min: 1499 },
  DIWALI20: { pct: 20, min: 0, expired: true },
};

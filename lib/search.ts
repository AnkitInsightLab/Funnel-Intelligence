// Store search. literalSearch is the original (every word must appear); smartSearch is
// the shipped fix (fix_search_synonyms): synonyms, Hinglish price intent, typo tolerance
// and an honest "did you mean" when nothing matches.
import catalog from './catalog.json';

type Product = (typeof catalog.products)[number];
const hay = (p: Product) => `${p.name} ${p.category.replace('_', ' ')}`.toLowerCase();

export function literalSearch(q: string): Product[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.products.filter((p) => words.every((w) => hay(p).includes(w)));
}

const SYNONYMS: [RegExp, string][] = [
  // common misspellings first, so the synonyms below see the corrected word
  [/\b(protien|protine|protin|protean)\b/g, 'protein'],
  [/\bweight gainers?\b/g, 'mass gainer'], [/\bgainers?\b/g, 'mass gainer'], [/\bmass mass gainer\b/g, 'mass gainer'],
  [/\bprotein powder\b/g, 'whey'], [/\bwhey protein\b/g, 'whey'], [/^protein$/g, 'whey'],
  [/\bmulti ?vitamins?\b/g, 'multivitamin'], [/\bomega ?3?\b/g, 'fish oil'], [/\bpb\b/g, 'peanut butter'],
  [/\bpreworkout\b/g, 'pre workout'], [/\bcreatin\b/g, 'creatine'], [/\bisolate protein\b/g, 'isolate'],
];
const PRICE_INTENT = /\b(sasta|saste|sasti|cheap|cheapest|budget|kam daam|low price)\b/g;
const NOT_STOCKED: [RegExp, string, string][] = [
  [/\bbiotin\b/, 'biotin', 'vitamins'], [/\bgumm(y|ies)\b/, 'gummies', 'creatine'], [/\bplant protein|vegan protein|pea protein\b/, 'plant protein', 'whey'],
];

const VOCAB = [...new Set(catalog.products.flatMap((p) => hay(p).split(/[^a-z0-9-]+/)).filter((w) => w.length > 2))];
function editDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function correctWord(w: string) {
  if (w.length < 4 || VOCAB.includes(w)) return w;
  let best = w, bestD = w.length >= 7 ? 2 : 1;
  for (const v of VOCAB) { const dd = editDistance(w, v); if (dd <= bestD && dd > 0) { best = v; bestD = dd; } }
  return best;
}

export interface SmartResult { results: Product[]; searchedFor: string; corrected: boolean; priceSorted: boolean; notStocked?: string; suggestion?: string }

export function smartSearch(raw: string): SmartResult {
  let q = raw.toLowerCase().trim();
  const priceSorted = new RegExp(PRICE_INTENT.source).test(q);
  q = q.replace(PRICE_INTENT, ' ');
  for (const [re, to] of SYNONYMS) q = q.replace(re, to);
  q = q.split(/\s+/).filter(Boolean).map(correctWord).join(' ');
  const ns = NOT_STOCKED.find(([re]) => re.test(raw.toLowerCase()));
  let results = q ? literalSearch(q) : catalog.products.slice();
  // drop size/flavour words that over-constrain ("whey isolate chocolate 2kg"): keep the longest matching prefix
  if (!results.length && q.includes(' ')) {
    const words = q.split(' ');
    for (let n = words.length - 1; n >= 1 && !results.length; n--) results = literalSearch(words.slice(0, n).join(' '));
  }
  if (priceSorted) results = [...results].sort((a, b) => a.price - b.price);
  const corrected = q !== raw.toLowerCase().trim();
  return {
    results, searchedFor: q || raw, corrected, priceSorted,
    notStocked: ns?.[1],
    suggestion: !results.length ? (ns ? catalog.categories.find((c) => c.id === ns[2])?.name : 'Whey Protein') : undefined,
  };
}

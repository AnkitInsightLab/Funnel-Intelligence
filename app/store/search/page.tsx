'use client';
import { Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import catalog from '@/lib/catalog.json';
import { ProductCard } from '@/components/StoreBits';
import { track } from '@/lib/datalayer';
import { useFlag, expose } from '@/lib/flags';
import { literalSearch, smartSearch } from '@/lib/search';

// Control: the original literal search (every word must appear), the dead end the
// analysis found. Treatment (fix_search_synonyms): synonyms, typo tolerance, Hinglish
// price intent and a "did you mean". results_count is what the shopper actually sees.
function Results() {
  const q = (useSearchParams().get('q') ?? '').trim().toLowerCase();
  const flag = useFlag('fix_search_synonyms');
  const smart = useMemo(() => smartSearch(q), [q]);
  const literal = useMemo(() => literalSearch(q), [q]);
  const fixed = flag === 'treatment';
  const results = fixed ? smart.results : literal;

  useEffect(() => {
    if (!q || !flag) return;
    expose('fix_search_synonyms', flag);
    track('search_performed', { query: q, results_count: results.length });
  }, [q, flag, results.length]);

  if (!flag) return <div style={{ padding: '8px 0 80px' }}><h1>Searching…</h1></div>;
  return (
    <div style={{ padding: '8px 0 80px' }}>
      <h1>Results for &ldquo;{q}&rdquo;</h1>
      {fixed && smart.corrected && results.length > 0 && (
        <p className="small" style={{ color: '#3b3a37' }}>Showing results for <b>{smart.searchedFor}</b>{smart.priceSorted ? ', lowest price first' : ''}.</p>
      )}
      {fixed && smart.notStocked && (
        <p className="small" style={{ color: '#3b3a37' }}>We don&apos;t stock {smart.notStocked} yet. {results.length ? 'Closest matches:' : ''}</p>
      )}
      {results.length === 0 ? (
        <div className="panel">
          <p><b>No products found.</b></p>
          {fixed ? (
            <>
              <p className="small" style={{ margin: '0 0 8px' }}>Did you mean{' '}
                <Link href={`/store/c/${catalog.categories.find((c) => c.name === smart.suggestion)?.id ?? 'whey'}`} onClick={() => track('search_suggestion_clicked', { query: q })}>
                  {smart.suggestion}
                </Link>?
              </p>
              <div className="pgrid">{catalog.products.filter((p) => p.category === (catalog.categories.find((c) => c.name === smart.suggestion)?.id ?? 'whey')).slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}</div>
            </>
          ) : (
            <p className="small" style={{ color: '#64625d', margin: 0 }}>This dead end is on purpose in the control group. It is one of the leaks in the analysis: about one search in seven ends here.</p>
          )}
        </div>
      ) : (
        <div className="pgrid">{results.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      )}
      <p className="small" style={{ color: '#8f8c85', marginTop: 16 }}>Experiment fix_search_synonyms: {flag}</p>
    </div>
  );
}

export default function SearchPage() { return <Suspense><Results /></Suspense>; }

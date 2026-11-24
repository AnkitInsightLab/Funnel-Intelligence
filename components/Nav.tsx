'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Summary'],
  ['/fixes', 'Shipped fixes'],
  ['/insights', 'Insights'],
  ['/experiments', 'Experiments'],
  ['/retention', 'Retention'],
  ['/journeys', 'CRM journeys'],
  ['/growth', 'Growth model'],
  ['/live', 'Live'],
  ['/ask', 'AI analysts'],
  ['/roadmap', 'Roadmap'],
  ['/tracking-plan', 'Tracking plan'],
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? 'on' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

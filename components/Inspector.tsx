'use client';
// On-page data layer inspector: shows each event as it is pushed, which
// destinations received it, and any tracking-plan violations.
import { useEffect, useState } from 'react';
import { history, onTrack, type TrackedEvent } from '@/lib/datalayer';

export default function Inspector() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setEvents([...history]);
    return onTrack(() => setEvents([...history]));
  }, []);

  return (
    <>
      <button className="dli-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Close data layer' : 'Data layer'}<b>{events.length}</b>
      </button>
      {open && (
        <div className="dli" role="log" aria-label="Data layer events">
          <header>
            <b>Live data layer</b> · every event this page sends, newest first. &ldquo;off&rdquo; means that destination has no key configured.
          </header>
          {events.length === 0 && <div className="ev">No events yet. Click around the store.</div>}
          {events.map((e, i) => (
            <div className="ev" key={e.at + e.event + i}>
              <div>
                <span className="n">{e.event}</span>{' '}
                <span style={{ color: '#8f8c85' }}>{new Date(e.at).toLocaleTimeString()}</span>{' '}
                <button onClick={() => setExpanded(expanded === i ? null : i)} style={{ background: 'none', border: 0, color: '#9ec1ff', cursor: 'pointer', font: 'inherit' }}>
                  {expanded === i ? 'hide' : 'payload'}
                </button>
              </div>
              <div className="d">
                {Object.entries(e.destinations).map(([k, v]) => <span key={k} className={v.split(' ')[0]}>{k}: {v}</span>)}
              </div>
              {e.issues.length > 0 && <div className="iss">⚠ {e.issues.join('; ')}</div>}
              {expanded === i && <pre>{JSON.stringify(e.props, null, 2)}</pre>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

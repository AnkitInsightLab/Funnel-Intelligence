// Live control vs treatment for each shipped fix, from real store events in Neon.
// A session counts as converted when the fix's metric event happens after its first
// exposure (experiment_viewed) in that session. Aggregates only.
import { neon } from '@neondatabase/serverless';
import { FIXES } from '@/lib/fixes';

export const dynamic = 'force-dynamic';
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function GET() {
  if (!sql) return Response.json({ configured: false });
  try {
    const keys = FIXES.map((f) => f.key);
    const metrics = FIXES.map((f) => f.metric);
    const rows = await sql`
      WITH m AS (SELECT * FROM unnest(${keys}::text[], ${metrics}::text[]) AS t(experiment, metric)),
      x AS (
        SELECT e.session_id, e.experiment, min(e.variant) AS variant, min(e.event_time) AS exposed_at
        FROM events e
        WHERE e.source = 'live' AND e.event_name = 'experiment_viewed' AND e.experiment = ANY(${keys}::text[])
        GROUP BY 1, 2
      )
      SELECT x.experiment, x.variant, count(*)::int AS sessions,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM events c WHERE c.source = 'live' AND c.session_id = x.session_id
            AND c.event_name = m.metric AND c.event_time >= x.exposed_at))::int AS converted
      FROM x JOIN m USING (experiment)
      GROUP BY 1, 2 ORDER BY 1, 2`;
    return Response.json({ configured: true, rows, at: new Date().toISOString() });
  } catch (e) {
    console.error('fixes readout', e);
    return Response.json({ configured: true, error: 'query_failed' }, { status: 500 });
  }
}

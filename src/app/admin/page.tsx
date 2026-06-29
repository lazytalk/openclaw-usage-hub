import { requireSession } from "@/lib/auth";
import { getDatabaseHealth, query } from "@/lib/db";

async function getOverview() {
  const [{ count = "0" } = { count: "0" }] = (await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM usage_events")).rows;
  const latest = await query<{
    created_at: string | null;
    gateway_profile: string | null;
    machine_identity: string | null;
  }>(
    `
      SELECT created_at::text, gateway_profile, machine_identity
      FROM usage_events
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );

  const topDimensions = await query<{ label: string; total: string }>(
    `
      SELECT label, total::text
      FROM (
        SELECT COALESCE(channel_name, 'unknown') AS label, COUNT(*) AS total FROM usage_events GROUP BY 1
        UNION ALL
        SELECT COALESCE(agent_name, agent_id, 'unknown') AS label, COUNT(*) AS total FROM usage_events GROUP BY 1
      ) ranked
      ORDER BY total DESC, label ASC
      LIMIT 6
    `,
  );

  return {
    eventCount: Number(count),
    latest: latest.rows[0] ?? null,
    topDimensions: topDimensions.rows,
  };
}

export default async function AdminPage() {
  const session = await requireSession();
  const [database, overview] = await Promise.all([getDatabaseHealth(), getOverview()]);

  const cards = [
    { label: "Database latency", value: `${database.latencyMs} ms` },
    { label: "Stored events", value: overview.eventCount.toLocaleString() },
    { label: "Latest gateway", value: overview.latest?.gateway_profile ?? "none yet" },
    { label: "Latest machine", value: overview.latest?.machine_identity ?? "none yet" },
  ];

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] px-6 py-6 shadow-[0_24px_80px_rgba(40,35,20,0.08)] sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-teal-800/70">Admin console</p>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-950">Usage hub control room</h1>
            <p className="max-w-3xl text-base leading-7 text-stone-700">
              Signed in as {session.username}. The ingest pipeline is live, Postgres is connected, and the data model is ready for the next reporting layers: grouped APIs, pivot builder, and chart-driven drilldown.
            </p>
          </div>

          <form action="/api/auth/logout" method="post">
            <button type="submit" className="inline-flex rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-800 transition hover:border-stone-950 hover:bg-stone-950 hover:text-stone-50">
              Sign out
            </button>
          </form>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article key={card.label} className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_16px_40px_rgba(40,35,20,0.07)]">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-500">{card.label}</p>
              <p className="mt-4 text-3xl font-semibold text-stone-950">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_40px_rgba(40,35,20,0.07)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Roadmap slice</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">What is implemented now</h2>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-teal-900">Phase 1 active</span>
            </div>
            <ul className="mt-6 grid gap-3 text-sm leading-7 text-stone-700">
              <li className="rounded-2xl bg-[var(--surface-strong)] px-4 py-3">Authenticated admin login with signed session cookies.</li>
              <li className="rounded-2xl bg-[var(--surface-strong)] px-4 py-3">HTTP ingest endpoint with bearer-token protection and idempotent upsert.</li>
              <li className="rounded-2xl bg-[var(--surface-strong)] px-4 py-3">Postgres migration tooling and a central usage_events table aligned to the local ledger schema.</li>
              <li className="rounded-2xl bg-[var(--surface-strong)] px-4 py-3">Dashboard shell ready for grouped reporting APIs and drag-and-drop pivot exploration.</li>
            </ul>
          </article>

          <article className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_40px_rgba(40,35,20,0.07)]">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Next pivot dimensions</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-stone-700">
              {[
                "machine_identity",
                "gateway_profile",
                "agent_name",
                "provider",
                "model",
                "platform_user_display_name",
                "channel_name",
                "call_source",
              ].map((item) => (
                <span key={item} className="rounded-full border border-[var(--border)] bg-white px-3 py-2">{item}</span>
              ))}
            </div>

            <div className="mt-8 space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Recent grouping signals</p>
              {overview.topDimensions.length ? overview.topDimensions.map((row) => (
                <div key={`${row.label}-${row.total}`} className="flex items-center justify-between rounded-2xl bg-[var(--surface-strong)] px-4 py-3 text-sm text-stone-800">
                  <span className="truncate pr-4">{row.label}</span>
                  <span className="font-mono">{row.total}</span>
                </div>
              )) : <p className="rounded-2xl bg-[var(--surface-strong)] px-4 py-3 text-sm text-stone-600">No events ingested yet.</p>}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
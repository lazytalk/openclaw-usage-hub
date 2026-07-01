import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) redirect("/admin");

  const params = searchParams ? await searchParams : {};
  const error = params.error === "invalid" ? "Invalid username or password." : null;
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "OpenClaw Usage Hub";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_100px_rgba(40,35,20,0.12)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col justify-between gap-10 bg-[linear-gradient(160deg,#0f766e_0%,#164e63_100%)] px-8 py-10 text-stone-50 sm:px-10">
          <div className="space-y-6">
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-teal-100/80">Central usage ingest</p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">{appName}</h1>
            <p className="max-w-xl text-lg leading-8 text-teal-50/85">
              Ship OpenClaw usage events to one place, protect the admin surface, and prepare the data model for pivot reporting.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-teal-50/80 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/8 p-4">HTTP ingest endpoint for plugins</div>
            <div className="rounded-2xl border border-white/15 bg-white/8 p-4">Postgres-backed central ledger</div>
            <div className="rounded-2xl border border-white/15 bg-white/8 p-4">Admin shell ready for pivot reporting</div>
          </div>
        </div>
        <div className="flex items-center px-6 py-8 sm:px-10">
          <form action="/api/auth/login" method="post" className="w-full space-y-6">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-teal-800/70">Admin login</p>
              <h2 className="text-3xl font-semibold tracking-tight text-stone-900">Enter the reporting console</h2>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">Username</span>
                <input
                  name="username"
                  type="text"
                  autoComplete="username"
                  className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-teal-700"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-teal-700"
                />
              </label>
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
            ) : null}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-stone-950 px-6 py-3 font-medium text-stone-50 transition hover:bg-teal-800"
            >
              Sign in
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

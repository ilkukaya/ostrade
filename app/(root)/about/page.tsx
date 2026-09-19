import { BarChart3, Database, FlaskConical, ShieldCheck } from 'lucide-react';

export const metadata = {
    title: 'About',
    description: 'OSTRADE product principles and research workflow.',
};

export default function AboutPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-14 pb-20">
            <section className="pt-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-300">About OSTRADE</p>
                <h1 className="max-w-3xl text-4xl font-black tracking-tight text-foreground md:text-6xl">
                    A calmer way to research swing setups.
                </h1>
                <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                    OSTRADE is a private research terminal built around end-of-day data, deterministic rules and reproducible analysis.
                    It is designed to help one owner review markets consistently rather than chase intraday noise.
                </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <Principle icon={<Database />} title="Local-first market data" text="Daily bars are normalized into MongoDB before the scanner, review and backtest layers consume them." />
                <Principle icon={<BarChart3 />} title="Explainable scoring" text="Every setup exposes the exact rules, scores and failed conditions behind its classification." />
                <Principle icon={<FlaskConical />} title="Research before conviction" text="Candidates, backtests, train/holdout checks and Monte Carlo are kept separate from actual journaled trades." />
                <Principle icon={<ShieldCheck />} title="Private by default" text="The deployment is owner-only and protected server-side; there is no public member product in this build." />
            </section>

            <section className="rounded-3xl border border-border bg-card p-7 shadow-sm md:p-10">
                <h2 className="text-2xl font-bold text-foreground">Current workflow</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    Sync BIST or US daily data, generate the daily analysis snapshot, review changes, scan for setups,
                    save candidates worth following, backtest the same deterministic rule engine, and record only trades
                    that were actually taken in the Journal.
                </p>
            </section>
        </div>
    );
}

function Principle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">{icon}</div>
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
        </div>
    );
}

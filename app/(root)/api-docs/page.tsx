import type { Metadata } from 'next';
import { Database, GitBranch, Server, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Architecture',
    description: 'OSTRADE architecture and data-flow overview.',
};

const stages = [
    ['Market data', 'Yahoo daily EOD for BIST, Stooq/Yahoo routing for supported US history, normalized into MarketBar.'],
    ['Research engine', 'Technical indicators feed the deterministic swing rule engine. Scanner and stock detail reuse the same analysis path.'],
    ['Daily review', 'DailyAnalysisSnapshot stores one market observation per symbol/session and powers Daily and Weekly Review.'],
    ['Research records', 'Candidates freeze a setup snapshot. Backtests freeze strategy and dataset provenance. Journal stores actual user-entered trades separately.'],
];

export default function ApiDocsPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-12 pb-20">
            <section className="pt-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-300">Architecture</p>
                <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl">How OSTRADE moves data</h1>
                <p className="mt-4 max-w-3xl text-muted-foreground">The terminal is intentionally local-first and deterministic for its trading research layer.</p>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                {stages.map(([title, text], index) => (
                    <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <div className="mb-3 text-xs font-mono text-teal-600 dark:text-teal-300">0{index + 1}</div>
                        <h2 className="text-lg font-bold text-foreground">{title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                    </div>
                ))}
            </section>

            <section className="grid gap-4 md:grid-cols-4">
                <Tech icon={<Server />} label="Next.js / Netlify" />
                <Tech icon={<Database />} label="MongoDB Atlas" />
                <Tech icon={<GitBranch />} label="GitHub CI" />
                <Tech icon={<ShieldCheck />} label="Owner-only auth" />
            </section>

            <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-sm text-amber-800 dark:text-amber-200">
                Historical index backtests use static current constituent lists unless point-in-time universes are explicitly added later.
                Treat survivorship-bias warnings as material research limitations.
            </section>
        </div>
    );
}

function Tech({ icon, label }: { icon: React.ReactNode; label: string }) {
    return <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-semibold text-foreground"><span className="text-teal-600 dark:text-teal-300">{icon}</span>{label}</div>;
}

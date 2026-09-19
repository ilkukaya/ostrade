import type { Metadata } from 'next';
import { BookOpen, Database, HelpCircle, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Help',
    description: 'OSTRADE operating guide and common questions.',
};

const faqs = [
    ['What should I do each evening?', 'Open Market Data, update the market you want to review, generate Daily Analysis, then use Daily Review and Scanner.'],
    ['Why can a high score still be WATCH?', 'A score is descriptive, but QUALIFIED requires every mandatory rule for that setup to pass. A failed RVOL rule, for example, can keep an 85/100 setup at WATCH.'],
    ['Is a Candidate the same as a trade?', 'No. A Candidate is a saved research snapshot. Journal is reserved for trades you actually took.'],
    ['Why does Backtest warn about survivorship bias?', 'Static index universes use today’s constituents across historical periods. Removed or failed companies are absent, so historical performance can look better than a true point-in-time universe.'],
    ['Do I need live data?', 'No. OSTRADE is designed around completed daily sessions. The goal is repeatable end-of-day swing research, not intraday execution.'],
];

export default function HelpPage() {
    return (
        <div className="mx-auto max-w-4xl pb-20">
            <section className="pt-8">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300"><HelpCircle /></div>
                <h1 className="text-4xl font-black tracking-tight text-foreground">OSTRADE operating guide</h1>
                <p className="mt-3 text-muted-foreground">A short reference for the private research workflow.</p>
            </section>

            <section className="mt-10 grid gap-4 md:grid-cols-3">
                <Quick icon={<Database />} title="1. Sync" text="Update completed daily bars in Market Data." />
                <Quick icon={<BookOpen />} title="2. Review" text="Generate Daily Analysis, then inspect Review and Scanner." />
                <Quick icon={<ShieldCheck />} title="3. Separate research" text="Candidates are observations; Journal is actual execution." />
            </section>

            <section className="mt-12 space-y-3">
                {faqs.map(([q, a]) => (
                    <details key={q} className="group rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <summary className="cursor-pointer list-none font-semibold text-foreground">{q}</summary>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
                    </details>
                ))}
            </section>
        </div>
    );
}

function Quick({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return <div className="rounded-2xl border border-border bg-card p-5"><div className="text-teal-600 dark:text-teal-300">{icon}</div><h2 className="mt-3 font-bold text-foreground">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>;
}

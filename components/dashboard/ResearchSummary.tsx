import Link from 'next/link';
import { Activity, BookOpen, LineChart, Search, TrendingUp } from 'lucide-react';

interface ResearchSummaryProps {
    activeCandidateCount: number;
    openTradeCount: number;
    closedTradeCount: number;
    closedTradeWinRate: number | null;
}

export default function ResearchSummary({ activeCandidateCount, openTradeCount, closedTradeCount, closedTradeWinRate }: ResearchSummaryProps) {
    return (
        <section className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
                icon={<Activity className="h-4 w-4" />}
                label="Active Candidates"
                value={String(activeCandidateCount)}
                href="/candidates"
                hint="Saved signals still awaiting a target/stop"
            />
            <SummaryCard
                icon={<BookOpen className="h-4 w-4" />}
                label="Open Trades"
                value={String(openTradeCount)}
                href="/journal"
                hint="Logged trades not yet closed"
            />
            <SummaryCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Closed-Trade Win Rate"
                value={closedTradeCount > 0 ? `${(closedTradeWinRate! * 100).toFixed(0)}%` : '—'}
                href="/statistics"
                hint={closedTradeCount > 0 ? `n = ${closedTradeCount} closed trades` : 'No closed trades yet'}
            />
            <SummaryCard icon={<Search className="h-4 w-4" />} label="Find a setup" value="Scanner" href="/scanner" hint="Scan a universe for QUALIFIED setups" />
        </section>
    );
}

function SummaryCard({ icon, label, value, href, hint }: { icon: React.ReactNode; label: string; value: string; href: string; hint: string }) {
    return (
        <Link
            href={href}
            className="flex flex-col gap-2 rounded-2xl border border-gray-800 bg-gray-950/40 p-4 backdrop-blur-sm transition-colors hover:border-teal-700 hover:bg-gray-950/60"
        >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                <span className="text-teal-400">{icon}</span>
                {label}
            </div>
            <div className="text-2xl font-semibold text-white">{value}</div>
            <div className="text-xs text-gray-600">{hint}</div>
        </Link>
    );
}

export function QuickLinks() {
    const links = [
        { href: '/backtest', label: 'Backtest a strategy' },
        { href: '/monte-carlo', label: 'Run Monte Carlo' },
        { href: '/candidates', label: 'Review candidates' },
    ];
    return (
        <div className="flex flex-wrap gap-3">
            {links.map((l) => (
                <Link
                    key={l.href}
                    href={l.href}
                    className="flex items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-black/50"
                >
                    <LineChart className="h-3.5 w-3.5 text-teal-400" />
                    {l.label}
                </Link>
            ))}
        </div>
    );
}

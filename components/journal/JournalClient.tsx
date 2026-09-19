'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { closeTrade, deleteTrade, refreshExcursion } from '@/lib/actions/trade.actions';
import type { SerializedTrade, TradeStatus } from '@/lib/trades/types';

const STATUS_META: Record<TradeStatus, { label: string; classes: string }> = {
    OPEN: { label: 'Open', classes: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
    WIN: { label: 'Win', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    LOSS: { label: 'Loss', classes: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    BREAKEVEN: { label: 'Breakeven', classes: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
};

function formatMoney(value: number | undefined, currency: string): string {
    if (value === undefined) return '—';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
    } catch {
        return value.toFixed(2);
    }
}

interface Filters {
    status: 'ALL' | TradeStatus;
    symbol: string;
    from: string;
    to: string;
}

const DEFAULT_FILTERS: Filters = { status: 'ALL', symbol: '', from: '', to: '' };

export default function JournalClient({ trades }: { trades: SerializedTrade[] }) {
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [items, setItems] = useState(trades);

    const filtered = useMemo(() => {
        return items.filter((t) => {
            if (filters.status !== 'ALL' && t.status !== filters.status) return false;
            if (filters.symbol && !t.symbol.toUpperCase().includes(filters.symbol.toUpperCase())) return false;
            if (filters.from && t.entryDate < filters.from) return false;
            if (filters.to && t.entryDate > filters.to) return false;
            return true;
        });
    }, [items, filters]);

    const closedTrades = items.filter((t) => t.status !== 'OPEN');
    const summary = useMemo(() => {
        if (closedTrades.length === 0) return null;
        const wins = closedTrades.filter((t) => t.status === 'WIN').length;
        const withR = closedTrades.filter((t) => t.rMultiple !== undefined);
        const avgR = withR.length > 0 ? withR.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / withR.length : null;
        return { n: closedTrades.length, winRate: (wins / closedTrades.length) * 100, avgR };
    }, [closedTrades]);

    if (items.length === 0) {
        return (
            <div className="rounded-lg border border-gray-800 bg-black/20 p-8 text-center text-sm text-gray-500">
                No trades logged yet.{' '}
                <Link href="/journal/new" className="text-teal-400 hover:underline">
                    Log your first trade
                </Link>
                .
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {summary ? (
                <p className="text-xs text-gray-500">
                    Closed trades: n={summary.n} · Win rate {summary.winRate.toFixed(1)}%
                    {summary.avgR !== null ? ` · Avg R ${summary.avgR.toFixed(2)}` : ''} — see{' '}
                    <Link href="/statistics" className="text-teal-400 hover:underline">
                        Statistics
                    </Link>{' '}
                    for a full breakdown.
                </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                <Field label="Status">
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
                        className={selectClass}
                    >
                        <option value="ALL">All</option>
                        <option value="OPEN">Open</option>
                        <option value="WIN">Win</option>
                        <option value="LOSS">Loss</option>
                        <option value="BREAKEVEN">Breakeven</option>
                    </select>
                </Field>
                <Field label="Symbol">
                    <input
                        type="text"
                        value={filters.symbol}
                        onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value }))}
                        placeholder="e.g. AAPL"
                        className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                    />
                </Field>
                <Field label="From">
                    <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className={selectClass} />
                </Field>
                <Field label="To">
                    <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className={selectClass} />
                </Field>
                <span className="text-xs text-gray-500">
                    Showing {filtered.length} of {items.length}
                </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="w-8 px-3 py-3" />
                            <th className="px-3 py-3">Entry Date</th>
                            <th className="px-3 py-3">Symbol</th>
                            <th className="px-3 py-3">Dir</th>
                            <th className="px-3 py-3 text-right">Entry</th>
                            <th className="px-3 py-3 text-right">Exit</th>
                            <th className="px-3 py-3 text-right">Size</th>
                            <th className="px-3 py-3 text-right">R-Multiple</th>
                            <th className="px-3 py-3 text-right">Net P/L</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filtered.map((trade) => (
                            <TradeRow
                                key={trade._id}
                                trade={trade}
                                expanded={expandedId === trade._id}
                                onToggleExpand={() => setExpandedId((id) => (id === trade._id ? null : trade._id))}
                                onDelete={() => setItems((prev) => prev.filter((t) => t._id !== trade._id))}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const selectClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-3 text-sm text-gray-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

function TradeRow({
    trade,
    expanded,
    onToggleExpand,
    onDelete,
}: {
    trade: SerializedTrade;
    expanded: boolean;
    onToggleExpand: () => void;
    onDelete: () => void;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
    const [exitPrice, setExitPrice] = useState<number | ''>('');
    const [closeFees, setCloseFees] = useState<number | ''>(trade.fees ?? '');

    const meta = STATUS_META[trade.status];

    const handleClose = () => {
        if (exitPrice === '' || !(exitPrice > 0)) return;
        startTransition(async () => {
            const outcome = await closeTrade({
                tradeId: trade._id,
                exitDate,
                exitPrice,
                fees: closeFees === '' ? undefined : closeFees,
            });
            // grossPnl/netPnl/rMultiple/status/MFE/MAE are all recomputed
            // server-side — router.refresh() re-fetches this route's server
            // component data rather than duplicating that math here.
            if (outcome.success) router.refresh();
        });
    };

    const handleRefreshExcursion = () => {
        startTransition(async () => {
            await refreshExcursion(trade._id);
            router.refresh();
        });
    };

    const handleDelete = () => {
        startTransition(async () => {
            await deleteTrade(trade._id);
            onDelete();
        });
    };

    return (
        <>
            <tr className="hover:bg-white/5">
                <td className="px-3 py-3">
                    <button type="button" onClick={onToggleExpand} className="text-gray-500 hover:text-gray-300">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                </td>
                <td className="px-3 py-3 text-gray-400">{new Date(trade.entryDate).toLocaleDateString()}</td>
                <td className="px-3 py-3 font-semibold text-white">
                    <Link href={`/stocks/${trade.symbol}`} className="hover:text-teal-400">
                        {trade.symbol}
                    </Link>
                </td>
                <td className="px-3 py-3 text-gray-300">{trade.direction}</td>
                <td className="px-3 py-3 text-right text-gray-300">{formatMoney(trade.entryPrice, trade.currency)}</td>
                <td className="px-3 py-3 text-right text-gray-300">{formatMoney(trade.exitPrice, trade.currency)}</td>
                <td className="px-3 py-3 text-right text-gray-300">{trade.positionSize.toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-gray-300">{trade.rMultiple !== undefined ? `${trade.rMultiple.toFixed(2)}R` : '—'}</td>
                <td className={`px-3 py-3 text-right ${trade.netPnl !== undefined ? (trade.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-gray-300'}`}>
                    {formatMoney(trade.netPnl, trade.currency)}
                </td>
                <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>{meta.label}</span>
                </td>
                <td className="px-3 py-3 text-right">
                    <button type="button" onClick={handleDelete} disabled={isPending} className="text-gray-500 hover:text-rose-400 disabled:opacity-50" title="Delete this trade">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </td>
            </tr>
            {expanded ? (
                <tr>
                    <td colSpan={11} className="bg-black/30 px-6 py-4">
                        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 md:grid-cols-4">
                            <div>
                                <span className="text-gray-600">Stop</span>
                                <p className="text-gray-200">{trade.stopLevel !== undefined ? formatMoney(trade.stopLevel, trade.currency) : '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Targets</span>
                                <p className="text-gray-200">{trade.targets && trade.targets.length > 0 ? trade.targets.map((t) => formatMoney(t, trade.currency)).join(' / ') : '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">MFE</span>
                                <p className="text-gray-200">{trade.maxFavorableExcursion !== undefined ? formatMoney(trade.maxFavorableExcursion, trade.currency) : '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">MAE</span>
                                <p className="text-gray-200">{trade.maxAdverseExcursion !== undefined ? formatMoney(trade.maxAdverseExcursion, trade.currency) : '—'}</p>
                            </div>
                            {trade.setupType ? (
                                <div>
                                    <span className="text-gray-600">Setup</span>
                                    <p className="text-gray-200">{trade.setupType.replace(/_/g, ' ')}</p>
                                </div>
                            ) : null}
                            {trade.candidateId ? (
                                <div>
                                    <span className="text-gray-600">Linked candidate</span>
                                    <p className="text-gray-200">
                                        <Link href="/candidates" className="text-teal-400 hover:underline">
                                            View on Candidates page
                                        </Link>
                                    </p>
                                </div>
                            ) : null}
                        </div>

                        {trade.notes ? <p className="mt-3 text-xs text-gray-400">Notes: {trade.notes}</p> : null}

                        {trade.status === 'OPEN' ? (
                            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-800 pt-4">
                                <Field label="Exit date">
                                    <input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} className={selectClass} />
                                </Field>
                                <Field label="Exit price">
                                    <input
                                        type="number"
                                        step={0.01}
                                        value={exitPrice}
                                        onChange={(e) => setExitPrice(e.target.value === '' ? '' : e.target.valueAsNumber)}
                                        className="h-9 w-28 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                                    />
                                </Field>
                                <Field label="Total fees">
                                    <input
                                        type="number"
                                        step={0.01}
                                        value={closeFees}
                                        onChange={(e) => setCloseFees(e.target.value === '' ? '' : e.target.valueAsNumber)}
                                        className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                                    />
                                </Field>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={isPending}
                                    className="flex h-9 items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-xs font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                                >
                                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                    Close Trade
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRefreshExcursion}
                                    disabled={isPending}
                                    className="flex h-9 items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 text-xs font-medium text-gray-300 hover:bg-black/50 disabled:opacity-50"
                                    title="Recompute MFE/MAE from entry through today"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    Refresh MFE/MAE
                                </button>
                            </div>
                        ) : null}
                    </td>
                </tr>
            ) : null}
        </>
    );
}

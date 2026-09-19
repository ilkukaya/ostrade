'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { addHolding, deleteHolding, type SerializedHolding } from '@/lib/actions/portfolio.actions';
import type { PortfolioValuation } from '@/lib/portfolio/valuation';

const inputClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

function formatMoney(value: number | null, currency: string): string {
    if (value === null) return '—';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
    } catch {
        return value.toFixed(2);
    }
}

export default function PortfolioClient({ holdings, valuation }: { holdings: SerializedHolding[]; valuation: PortfolioValuation }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [submitting, setSubmitting] = useState(false);

    const [symbol, setSymbol] = useState('');
    const [quantity, setQuantity] = useState(0);
    const [averageCost, setAverageCost] = useState(0);
    const [currency, setCurrency] = useState('USD');

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol.trim() || !(quantity > 0) || !(averageCost > 0)) {
            toast.error('Symbol, quantity, and average cost are all required.');
            return;
        }
        setSubmitting(true);
        try {
            const outcome = await addHolding({ symbol: symbol.toUpperCase(), quantity, averageCost, currency });
            if (outcome.success) {
                toast.success(`${symbol.toUpperCase()} added`);
                setSymbol('');
                setQuantity(0);
                setAverageCost(0);
                router.refresh();
            } else {
                toast.error('Could not add holding', { description: outcome.error });
            }
        } catch (error) {
            toast.error('Could not add holding', { description: error instanceof Error ? error.message : 'Unexpected error.' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = (holdingId: string) => {
        startTransition(async () => {
            await deleteHolding(holdingId);
            router.refresh();
        });
    };

    return (
        <div className="min-w-0 max-w-full space-y-6">
            <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                <Field label="Symbol">
                    <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL" className={inputClass} />
                </Field>
                <Field label="Quantity">
                    <input type="number" min={0} step="any" value={quantity || ''} onChange={(e) => setQuantity(e.target.valueAsNumber || 0)} className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                </Field>
                <Field label="Average cost">
                    <input type="number" min={0} step="any" value={averageCost || ''} onChange={(e) => setAverageCost(e.target.valueAsNumber || 0)} className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                </Field>
                <Field label="Currency">
                    <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                </Field>
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-9 items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Add / Add to Position
                </button>
                <p className="w-full text-xs text-gray-600">
                    Adding a symbol you already hold blends into that position (weighted-average cost) rather than
                    creating a duplicate row.
                </p>
            </form>

            {valuation.byCurrency.length > 0 ? (
                <div className="flex flex-wrap gap-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4 text-sm">
                    {valuation.byCurrency.map((g) => (
                        <div key={g.currency}>
                            <div className="text-[11px] uppercase tracking-wide text-gray-600">Total ({g.currency})</div>
                            <div className="font-semibold text-gray-100">{formatMoney(g.marketValue, g.currency)}</div>
                            {g.unrealizedPnl !== null ? (
                                <div className={`text-xs ${g.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {g.unrealizedPnl >= 0 ? '+' : ''}
                                    {formatMoney(g.unrealizedPnl, g.currency)} unrealized
                                </div>
                            ) : (
                                <div className="text-xs text-gray-600">Some quotes unavailable</div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            {holdings.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-black/20 p-8 text-center text-sm text-gray-500">No holdings tracked yet.</div>
            ) : (
                <div className="ostrade-scroll-x rounded-xl border border-gray-800">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-3 py-3">Symbol</th>
                                <th className="px-3 py-3 text-right">Quantity</th>
                                <th className="px-3 py-3 text-right">Avg Cost</th>
                                <th className="px-3 py-3 text-right">Current Price</th>
                                <th className="px-3 py-3 text-right">Market Value</th>
                                <th className="px-3 py-3 text-right">Unrealized P/L</th>
                                <th className="px-3 py-3 text-right">% of Portfolio</th>
                                <th className="px-3 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {valuation.holdings.map((row) => {
                                const holdingId = holdings.find((h) => h.symbol === row.symbol)?._id;
                                return (
                                    <tr key={row.symbol} className="text-gray-300">
                                        <td className="px-3 py-3 font-semibold text-white">{row.symbol}</td>
                                        <td className="px-3 py-3 text-right">{row.quantity.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right">{formatMoney(row.averageCost, row.currency)}</td>
                                        <td className="px-3 py-3 text-right">{row.currentPrice !== null ? formatMoney(row.currentPrice, row.currency) : '—'}</td>
                                        <td className="px-3 py-3 text-right">{formatMoney(row.marketValue, row.currency)}</td>
                                        <td className={`px-3 py-3 text-right ${row.unrealizedPnl !== null ? (row.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-gray-500'}`}>
                                            {row.unrealizedPnl !== null ? `${formatMoney(row.unrealizedPnl, row.currency)} (${row.unrealizedPnlPercent!.toFixed(1)}%)` : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right">{row.percentOfCurrencyGroup !== null ? `${row.percentOfCurrencyGroup.toFixed(1)}%` : '—'}</td>
                                        <td className="px-3 py-3 text-right">
                                            {holdingId ? (
                                                <button type="button" onClick={() => handleDelete(holdingId)} disabled={isPending} className="text-gray-500 hover:text-rose-400 disabled:opacity-50" title="Remove this holding">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

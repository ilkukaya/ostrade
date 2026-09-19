import type { OverallTradeStats, SetupTradeStats } from '@/lib/statistics/tradeStats';

function pct(value: number | null): string {
    return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null, digits = 2): string {
    return value === null ? '—' : value.toFixed(digits);
}

export default function TradeStatsSection({ overall, bySetup }: { overall: OverallTradeStats; bySetup: SetupTradeStats[] }) {
    const currencies = Object.keys(overall.byCurrency);

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-white">Trade Statistics</h2>
                <p className="mt-1 text-xs text-gray-500">
                    What the owner actually did, from the Trade Journal — distinct from the candidate statistics
                    above, which reflect the plan rather than the execution.
                </p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                <p className="mb-3 text-xs text-gray-500">
                    n = {overall.closedCount} closed of {overall.totalLogged} logged ({overall.openCount} still open —
                    excluded from win rate and R stats)
                </p>
                <div className="flex flex-wrap gap-6 text-sm">
                    <Stat label="Win rate" value={pct(overall.winRate)} />
                    <Stat label="Avg R (expectancy)" value={overall.avgR !== null ? `${num(overall.avgR)}R` : '—'} />
                    <Stat label="Median R" value={overall.medianR !== null ? `${num(overall.medianR)}R` : '—'} />
                </div>

                {currencies.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-6 border-t border-gray-800 pt-4 text-sm">
                        {currencies.map((currency) => {
                            const c = overall.byCurrency[currency];
                            return (
                                <div key={currency}>
                                    <div className="text-[11px] uppercase tracking-wide text-gray-600">
                                        Net P/L ({currency}, n={c.n})
                                    </div>
                                    <div className={`font-semibold ${c.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {c.totalNetPnl.toFixed(2)} {currency}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Profit factor: {c.profitFactor !== null ? c.profitFactor.toFixed(2) : '— (no losses yet)'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <p className="mt-3 text-xs text-gray-600">
                    P/L is never summed across currencies — each currency gets its own totals (see docs/statistics.md).
                </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-3 py-3">Setup</th>
                            <th className="px-3 py-3 text-right">n</th>
                            <th className="px-3 py-3 text-right">Win rate</th>
                            <th className="px-3 py-3 text-right">Avg R</th>
                            <th className="px-3 py-3 text-right">Median R</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {bySetup.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-gray-600">
                                    No closed trades yet.
                                </td>
                            </tr>
                        ) : (
                            bySetup.map((s) => (
                                <tr key={s.setupType} className="text-gray-300">
                                    <td className="px-3 py-3 font-semibold text-white">{s.setupType.replace(/_/g, ' ')}</td>
                                    <td className="px-3 py-3 text-right">{s.n}</td>
                                    <td className="px-3 py-3 text-right">{pct(s.winRate)}</td>
                                    <td className="px-3 py-3 text-right">{s.avgR !== null ? `${num(s.avgR)}R` : '—'}</td>
                                    <td className="px-3 py-3 text-right">{s.medianR !== null ? `${num(s.medianR)}R` : '—'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-600">{label}</div>
            <div className="font-semibold text-gray-100">{value}</div>
        </div>
    );
}

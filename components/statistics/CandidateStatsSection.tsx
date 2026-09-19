import type { BucketStats, OverallCandidateStats } from '@/lib/statistics/candidateStats';

function pct(value: number | null): string {
    return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null, digits = 2): string {
    return value === null ? '—' : value.toFixed(digits);
}

export default function CandidateStatsSection({ overall, buckets }: { overall: OverallCandidateStats; buckets: BucketStats[] }) {
    return (
        <section className="min-w-0 max-w-full space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-white">Candidate Statistics</h2>
                <p className="mt-1 text-xs text-gray-500">
                    Every figure below reflects what the saved signal <em>would have</em> returned if traded exactly
                    as planned (full size, no slippage/fees) — not what the owner actually did. See{' '}
                    <code className="text-gray-400">docs/statistics.md</code>.
                </p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                <p className="mb-3 text-xs text-gray-500">
                    n = {overall.resolvedCount} resolved of {overall.totalSaved} saved ({overall.activeCount} still
                    active, {overall.cancelledCount} cancelled — excluded from the rates below)
                </p>
                <div className="flex flex-wrap gap-6 text-sm">
                    <Stat label="Target hit rate" value={pct(overall.targetHitRate)} />
                    <Stat label="Stop hit rate" value={pct(overall.stopHitRate)} />
                    <Stat label="Ambiguous rate" value={pct(overall.ambiguousRate)} />
                    <Stat label="Expired rate" value={pct(overall.expiredRate)} />
                    <Stat label="Median realized R" value={overall.medianRealizedR !== null ? `${num(overall.medianRealizedR)}R` : '—'} />
                </div>
            </div>

            <div className="ostrade-scroll-x rounded-xl border border-gray-800">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-3 py-3">Score bucket</th>
                            <th className="px-3 py-3 text-right">n</th>
                            <th className="px-3 py-3 text-right">Target hit rate</th>
                            <th className="px-3 py-3 text-right">Stop rate</th>
                            <th className="px-3 py-3 text-right">Ambiguous</th>
                            <th className="px-3 py-3 text-right">Expired</th>
                            <th className="px-3 py-3 text-right">Median R</th>
                            <th className="px-3 py-3 text-right">Avg planned R:R</th>
                            <th className="px-3 py-3 text-right">Avg MFE</th>
                            <th className="px-3 py-3 text-right">Avg MAE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {buckets.map((b) => (
                            <tr key={b.label} className={b.n === 0 ? 'text-gray-600' : 'text-gray-300'}>
                                <td className="px-3 py-3 font-semibold text-white">{b.label}</td>
                                <td className="px-3 py-3 text-right">{b.n}</td>
                                <td className="px-3 py-3 text-right">{pct(b.target1PlusRate)}</td>
                                <td className="px-3 py-3 text-right">{pct(b.stopRate)}</td>
                                <td className="px-3 py-3 text-right">{pct(b.ambiguousRate)}</td>
                                <td className="px-3 py-3 text-right">{pct(b.expiredRate)}</td>
                                <td className="px-3 py-3 text-right">{b.medianRealizedR !== null ? `${num(b.medianRealizedR)}R` : '—'}</td>
                                <td className="px-3 py-3 text-right">{b.avgPlannedRiskReward !== null ? `1:${num(b.avgPlannedRiskReward)}` : '—'}</td>
                                <td className="px-3 py-3 text-right">{num(b.avgMaxFavorableExcursion)}</td>
                                <td className="px-3 py-3 text-right">{num(b.avgMaxAdverseExcursion)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-gray-600">
                Bucket boundaries are configurable (<code className="text-gray-500">lib/statistics/candidateStats.ts</code>
                ::DEFAULT_SCORE_BUCKETS) but not yet exposed as a UI control. A bucket with a small n is exactly as
                real as one with a large n — no bucket is hidden for being sparse, but treat a 2-candidate bucket&apos;s
                100% rate with proportionally less confidence than a 40-candidate bucket&apos;s.
            </p>
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

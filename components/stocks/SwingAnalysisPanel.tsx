import { TriangleAlert } from 'lucide-react';
import type { StockDataProvenance, SwingAnalysisOutcome } from '@/lib/actions/swing.actions';
import { formatPrice } from '@/lib/utils';
import { RuleRow, formatZone, statusClasses, statusLabel } from '@/components/swing/shared';
import SaveCandidateButton from '@/components/swing/SaveCandidateButton';
import { latestExpectedCompletedSession, type MarketId } from '@/lib/market-data/marketCalendar';

function DataProvenanceFooter({ provenance }: { provenance: StockDataProvenance }) {
    if (!provenance.latestDate) {
        return (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                <span>No market data stored for this symbol yet.</span>
            </div>
        );
    }

    const expected = latestExpectedCompletedSession(provenance.market as MarketId);
    const isStale = provenance.latestDate < expected;

    return (
        <div className={`mt-4 flex items-center gap-2 text-xs ${isStale ? 'rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-amber-300' : 'text-gray-600'}`}>
            {isStale ? <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>
                Data through: {provenance.latestDate} · Provider: {provenance.provider ?? 'unknown'} · Market: {provenance.market} · Currency: {provenance.currency}
                {isStale ? ` — stale, expected through ${expected}` : ''}
            </span>
        </div>
    );
}

export default function SwingAnalysisPanel({ symbol, outcome }: { symbol: string; outcome: SwingAnalysisOutcome }) {
    if (outcome.status === 'unavailable') {
        return (
            <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Swing Analysis</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                    <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>{outcome.reason}</span>
                </div>
            </section>
        );
    }

    const { analysis } = outcome;
    const passedCount = analysis.rules.filter((r) => r.passed).length;

    return (
        <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Swing Analysis</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">
                        {analysis.setupType ? analysis.setupType.replace(/_/g, ' ') : 'No setup'} setup
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        This is research output, not investment advice — the owner remains responsible for any
                        decisions. {passedCount}/{analysis.rules.length} rules passed.
                    </p>
                    <p className="mt-1 text-xs text-gray-600">Analysis as of {new Date(analysis.timestamp).toLocaleString()}</p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-black/20 p-4">
                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gray-500">Swing Score</p>
                        <p className="mt-1 text-2xl font-semibold text-white">
                            {analysis.score}
                            <span className="text-sm font-normal text-gray-500"> / {analysis.maxScore}</span>
                        </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(analysis.status)}`}>
                        {statusLabel(analysis.status)}
                    </span>
                    <SaveCandidateButton symbol={symbol} />
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2">
                {analysis.rules.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} />
                ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-800 bg-black/20 p-4">
                    <h3 className="text-sm font-semibold text-white">Levels</h3>
                    <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Support</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.supportLevels && analysis.supportLevels.length > 0
                                    ? analysis.supportLevels.map(formatZone).join(', ')
                                    : 'Unavailable'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Resistance</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.resistanceLevels && analysis.resistanceLevels.length > 0
                                    ? analysis.resistanceLevels.map(formatZone).join(', ')
                                    : 'Unavailable'}
                            </dd>
                        </div>
                    </dl>
                </div>

                <div className="rounded-xl border border-gray-800 bg-black/20 p-4">
                    <h3 className="text-sm font-semibold text-white">Trade Plan</h3>
                    <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Entry Zone</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.entryZone ? formatZone(analysis.entryZone) : 'Unavailable'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Invalidation</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.stopLevel !== undefined ? formatPrice(analysis.stopLevel) : 'Unavailable'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Target 1</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.targets?.[0] !== undefined ? formatPrice(analysis.targets[0]) : 'Unavailable'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Target 2</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.targets?.[1] !== undefined ? formatPrice(analysis.targets[1]) : 'Unavailable'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Potential R/R</dt>
                            <dd className="text-right text-gray-300">
                                {analysis.riskReward !== undefined ? `1 : ${analysis.riskReward.toFixed(2)}` : 'Unavailable'}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            {analysis.warnings && analysis.warnings.length > 0 ? (
                <div className="mt-4 space-y-2">
                    {analysis.warnings.map((warning) => (
                        <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{warning}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            <DataProvenanceFooter provenance={outcome.dataProvenance} />
        </section>
    );
}

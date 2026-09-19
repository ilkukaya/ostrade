'use client';

import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { calculatePositionSize } from '@/lib/risk/positionSizing';

/**
 * Pure, currency-aware sizing calculator (see lib/risk/positionSizing.ts) —
 * account equity and risk % are ephemeral inputs local to this widget, never
 * persisted (this app doesn't model a brokerage account), so the numbers
 * always reflect whatever the trader types in right now.
 */
export default function PositionSizeCalculator({
    entryPrice,
    stopPrice,
    currency,
    onApplyShares,
}: {
    entryPrice: number;
    stopPrice: number;
    currency: string;
    onApplyShares?: (shares: number) => void;
}) {
    const [accountEquity, setAccountEquity] = useState(10_000);
    const [riskPercent, setRiskPercent] = useState(1);

    const result = useMemo(
        () => calculatePositionSize({ accountEquity, riskPercent, entryPrice, stopPrice }),
        [accountEquity, riskPercent, entryPrice, stopPrice],
    );

    return (
        <div className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
                <Calculator className="h-4 w-4 text-teal-400" />
                Position Size Calculator
            </div>

            <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                    Account equity ({currency || 'USD'})
                    <input
                        type="number"
                        min={0}
                        value={accountEquity}
                        onChange={(e) => setAccountEquity(e.target.valueAsNumber || 0)}
                        className="h-9 w-32 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                    Risk per trade (%)
                    <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(e.target.valueAsNumber || 0)}
                        className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                    />
                </label>
            </div>

            <div className="mt-3">
                {result.valid ? (
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                        <Stat label="Risk budget" value={`${result.riskBudget.toFixed(2)} ${currency || 'USD'}`} />
                        <Stat label="Risk/share" value={`${result.riskPerShare.toFixed(2)} ${currency || 'USD'}`} />
                        <Stat label="Max shares" value={result.maxShares.toLocaleString()} highlight />
                        <Stat label="Position value" value={`${result.positionValue.toFixed(2)} ${currency || 'USD'}`} />
                        <Stat label="Exposure" value={`${(result.portfolioExposure * 100).toFixed(1)}%`} />
                        {onApplyShares ? (
                            <button
                                type="button"
                                onClick={() => onApplyShares(result.maxShares)}
                                className="rounded-md border border-teal-700 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-500/20"
                            >
                                Use this size
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <p className="text-xs text-amber-400/80">{result.reason}</p>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-600">{label}</div>
            <div className={highlight ? 'font-semibold text-emerald-400' : 'text-gray-200'}>{value}</div>
        </div>
    );
}

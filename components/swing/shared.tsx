import { CheckCircle2, XCircle } from 'lucide-react';
import type { PriceZone, RuleResult, SwingStatus } from '@/lib/swing/types';
import { formatPrice } from '@/lib/utils';

/**
 * Shared rendering helpers for a SwingAnalysisResult — used by both the
 * stock detail page (components/stocks/SwingAnalysisPanel.tsx) and the
 * scanner's per-row explainability view (components/scanner/*). Keeping
 * this in one place is what "the stock page already has rule-level
 * analysis, reuse that functionality" (docs/scanner.md) actually means in
 * code: one rule-row renderer, not two.
 */

export function formatZone(zone: PriceZone): string {
    return `${formatPrice(zone.low)} - ${formatPrice(zone.high)}`;
}

export function statusLabel(status: SwingStatus): string {
    if (status === 'QUALIFIED') return 'Qualified Setup';
    if (status === 'WATCH') return 'Watch';
    return 'Pass';
}

export function statusClasses(status: SwingStatus): string {
    if (status === 'QUALIFIED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (status === 'WATCH') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
}

export function RuleRow({ rule }: { rule: RuleResult }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-800 bg-black/20 p-3">
            <div className="flex items-start gap-3">
                {rule.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                )}
                <div>
                    <p className="text-sm font-semibold text-white">
                        {rule.name}
                        {rule.value !== undefined ? <span className="ml-2 font-normal text-gray-400">{String(rule.value)}</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{rule.explanation}</p>
                </div>
            </div>
            <span className={`shrink-0 text-xs font-semibold ${rule.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {rule.score}/{rule.maxScore}
            </span>
        </div>
    );
}

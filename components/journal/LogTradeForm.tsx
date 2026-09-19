'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createTrade, lookupInstrumentCurrency } from '@/lib/actions/trade.actions';
import type { TradeDirection } from '@/lib/trades/types';
import PositionSizeCalculator from '@/components/risk/PositionSizeCalculator';

const inputClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200';
const selectClass = inputClass;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

export default function LogTradeForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const candidateId = searchParams.get('candidateId') ?? undefined;

    const [symbol, setSymbol] = useState(searchParams.get('symbol') ?? '');
    const [direction, setDirection] = useState<TradeDirection>((searchParams.get('direction') as TradeDirection) ?? 'LONG');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
    const [entryPrice, setEntryPrice] = useState(0);
    const [positionSize, setPositionSize] = useState(0);
    const [stopLevel, setStopLevel] = useState<number | ''>(searchParams.get('stopLevel') ? Number(searchParams.get('stopLevel')) : '');
    const [target1, setTarget1] = useState<number | ''>(searchParams.get('target1') ? Number(searchParams.get('target1')) : '');
    const [target2, setTarget2] = useState<number | ''>(searchParams.get('target2') ? Number(searchParams.get('target2')) : '');
    const [fees, setFees] = useState<number | ''>('');
    const [currency, setCurrency] = useState('USD');
    const [currencyTouched, setCurrencyTouched] = useState(false);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSymbolBlur = async () => {
        if (!symbol || currencyTouched) return;
        const detected = await lookupInstrumentCurrency(symbol.toUpperCase());
        if (detected) setCurrency(detected);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol.trim()) {
            toast.error('Symbol is required.');
            return;
        }
        if (!(entryPrice > 0)) {
            toast.error('Entry price must be greater than zero.');
            return;
        }
        if (!(positionSize > 0)) {
            toast.error('Position size must be greater than zero.');
            return;
        }

        setSubmitting(true);
        try {
            const targets = [target1, target2].filter((t): t is number => t !== '' && t !== undefined);
            const outcome = await createTrade({
                candidateId,
                symbol: symbol.toUpperCase(),
                currency,
                direction,
                entryDate,
                entryPrice,
                positionSize,
                stopLevel: stopLevel === '' ? undefined : stopLevel,
                targets: targets.length > 0 ? targets : undefined,
                fees: fees === '' ? undefined : fees,
                notes: notes || undefined,
            });

            if (outcome.success) {
                toast.success(`${symbol.toUpperCase()} trade logged`);
                router.push('/journal');
            } else {
                toast.error('Could not log trade', { description: outcome.error });
            }
        } catch (error) {
            toast.error('Could not log trade', { description: error instanceof Error ? error.message : 'Unexpected error.' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
            {candidateId ? (
                <p className="rounded-md border border-teal-800 bg-teal-500/10 px-3 py-2 text-xs text-teal-300">
                    This trade will be linked back to the saved candidate it came from.
                </p>
            ) : null}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Symbol">
                    <input
                        type="text"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        onBlur={handleSymbolBlur}
                        placeholder="e.g. AAPL"
                        required
                        className={inputClass}
                    />
                </Field>
                <Field label="Direction">
                    <select value={direction} onChange={(e) => setDirection(e.target.value as TradeDirection)} className={selectClass}>
                        <option value="LONG">Long</option>
                        <option value="SHORT">Short</option>
                    </select>
                </Field>
                <Field label="Currency">
                    <input
                        type="text"
                        value={currency}
                        onChange={(e) => {
                            setCurrency(e.target.value.toUpperCase());
                            setCurrencyTouched(true);
                        }}
                        className={inputClass}
                    />
                </Field>
                <Field label="Entry date">
                    <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className={inputClass} />
                </Field>
                <Field label="Entry price">
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={entryPrice || ''}
                        onChange={(e) => setEntryPrice(e.target.valueAsNumber || 0)}
                        required
                        className={inputClass}
                    />
                </Field>
                <Field label="Position size (shares/units)">
                    <input
                        type="number"
                        min={0}
                        value={positionSize || ''}
                        onChange={(e) => setPositionSize(e.target.valueAsNumber || 0)}
                        required
                        className={inputClass}
                    />
                </Field>
                <Field label="Stop level">
                    <input
                        type="number"
                        step={0.01}
                        value={stopLevel}
                        onChange={(e) => setStopLevel(e.target.value === '' ? '' : e.target.valueAsNumber)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Target 1">
                    <input
                        type="number"
                        step={0.01}
                        value={target1}
                        onChange={(e) => setTarget1(e.target.value === '' ? '' : e.target.valueAsNumber)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Target 2">
                    <input
                        type="number"
                        step={0.01}
                        value={target2}
                        onChange={(e) => setTarget2(e.target.value === '' ? '' : e.target.valueAsNumber)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Fees (optional)">
                    <input
                        type="number"
                        step={0.01}
                        value={fees}
                        onChange={(e) => setFees(e.target.value === '' ? '' : e.target.valueAsNumber)}
                        className={inputClass}
                    />
                </Field>
            </div>

            <PositionSizeCalculator
                entryPrice={entryPrice}
                stopPrice={stopLevel === '' ? entryPrice : stopLevel}
                currency={currency}
                onApplyShares={setPositionSize}
            />

            <Field label="Notes">
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-gray-700 bg-black/30 px-2 py-1.5 text-sm text-gray-200"
                />
            </Field>

            <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
            >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Log Trade
            </button>
        </form>
    );
}

import { getBacktestRuns, getUniverseOptionsForBacktest } from '@/lib/actions/backtest.actions';
import BacktestClient from '@/components/backtest/BacktestClient';

export default async function BacktestPage() {
    const [universes, pastRuns] = await Promise.all([getUniverseOptionsForBacktest(), getBacktestRuns()]);

    return (
        <div className="mx-auto max-w-7xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Backtest</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Chronological, no-look-ahead simulation of the same deterministic rule engine used everywhere
                    else in this app — a signal here means exactly what a QUALIFIED result means on the stock page
                    or scanner. Research output, not investment advice. See <code className="text-gray-400">docs/backtesting.md</code>.
                </p>
            </div>
            <BacktestClient universes={universes} pastRuns={pastRuns} />
        </div>
    );
}

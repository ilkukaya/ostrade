import { getBacktestRuns } from '@/lib/actions/backtest.actions';
import MonteCarloClient from '@/components/monte-carlo/MonteCarloClient';

export default async function MonteCarloPage() {
    const backtestRuns = await getBacktestRuns();

    return (
        <div className="mx-auto max-w-6xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Monte Carlo</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Simulates many possible equity-curve paths by resampling a real historical R-multiple
                    distribution — a strategy-performance simulation, never a price prediction. See{' '}
                    <code className="text-gray-400">docs/monte-carlo.md</code>.
                </p>
            </div>
            <MonteCarloClient backtestRuns={backtestRuns} />
        </div>
    );
}

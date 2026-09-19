import { listCandidates } from '@/lib/actions/candidate.actions';
import { listTrades } from '@/lib/actions/trade.actions';
import { computeOverallCandidateStats, computeScoreBucketStats } from '@/lib/statistics/candidateStats';
import { computeOverallTradeStats, computeTradeStatsBySetup } from '@/lib/statistics/tradeStats';
import CandidateStatsSection from '@/components/statistics/CandidateStatsSection';
import TradeStatsSection from '@/components/statistics/TradeStatsSection';

export default async function StatisticsPage() {
    const [candidates, trades] = await Promise.all([listCandidates(), listTrades()]);

    const overallCandidateStats = computeOverallCandidateStats(candidates);
    const bucketStats = computeScoreBucketStats(candidates);
    const overallTradeStats = computeOverallTradeStats(trades);
    const setupTradeStats = computeTradeStatsBySetup(trades);

    return (
        <div className="mx-auto max-w-7xl space-y-10">
            <div>
                <h1 className="text-2xl font-semibold text-white">Statistics</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Candidate and trade statistics are kept deliberately separate — one is the plan, the other is the
                    execution. Every figure carries its own sample size; a small n is shown, never hidden.
                </p>
            </div>
            <CandidateStatsSection overall={overallCandidateStats} buckets={bucketStats} />
            <TradeStatsSection overall={overallTradeStats} bySetup={setupTradeStats} />
        </div>
    );
}

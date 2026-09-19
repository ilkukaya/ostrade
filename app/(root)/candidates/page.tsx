import { listCandidates } from '@/lib/actions/candidate.actions';
import { getQuotesForSymbols } from '@/lib/market-data/service';
import CandidatesClient from '@/components/candidates/CandidatesClient';

export default async function CandidatesPage() {
    const candidates = await listCandidates();
    const distinctSymbols = Array.from(new Set(candidates.map((c) => c.symbol)));
    const quotes = await getQuotesForSymbols(distinctSymbols);
    const currentPriceBySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

    return (
        <div className="mx-auto max-w-7xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Candidates</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Every saved setup is an immutable snapshot of what the engine found at signal time — it never
                    changes as the market moves. A candidate is not the same as an executed trade; see{' '}
                    <code className="text-gray-400">docs/candidates.md</code>.
                </p>
            </div>
            <CandidatesClient candidates={candidates} currentPriceBySymbol={currentPriceBySymbol} />
        </div>
    );
}

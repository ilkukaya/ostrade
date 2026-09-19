import { getPortfolioValuation } from '@/lib/actions/portfolio.actions';
import PortfolioClient from '@/components/portfolio/PortfolioClient';

export default async function PortfolioPage() {
    const { holdings, valuation } = await getPortfolioValuation();

    return (
        <div className="mx-auto max-w-6xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Portfolio</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Manually-entered holdings only — no broker connection or execution, same principle as the Trade
                    Journal. A current-value snapshot, not a historical performance tracker. See{' '}
                    <code className="text-gray-400">docs/portfolio.md</code>.
                </p>
            </div>
            <PortfolioClient holdings={holdings} valuation={valuation} />
        </div>
    );
}

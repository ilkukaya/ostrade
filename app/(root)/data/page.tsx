import { getFreshness } from '@/lib/actions/marketDataSync.actions';
import DataAdminClient from '@/components/data/DataAdminClient';

export default async function DataAdminPage() {
    const [us, tr] = await Promise.all([getFreshness('US'), getFreshness('TR')]);

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Market Data</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Owner-only data administration — synchronizes the local daily-bar database every other page in
                    this app reads from. See <code className="text-gray-400">docs/daily-data-engine.md</code>.
                </p>
            </div>
            <DataAdminClient initialFreshness={{ US: us, TR: tr }} />
        </div>
    );
}

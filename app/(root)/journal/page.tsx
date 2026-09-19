import Link from 'next/link';
import { listTrades } from '@/lib/actions/trade.actions';
import JournalClient from '@/components/journal/JournalClient';

export default async function JournalPage() {
    const trades = await listTrades();

    return (
        <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-white">Trade Journal</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Manually logged trades — no broker execution, ever. A trade is not the same as a saved{' '}
                        <Link href="/candidates" className="text-teal-400 hover:underline">
                            candidate
                        </Link>
                        ; see <code className="text-gray-400">docs/journal.md</code>.
                    </p>
                </div>
                <Link
                    href="/journal/new"
                    className="flex h-9 items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-sm font-medium text-teal-300 hover:bg-teal-500/20"
                >
                    Log Trade
                </Link>
            </div>
            <JournalClient trades={trades} />
        </div>
    );
}

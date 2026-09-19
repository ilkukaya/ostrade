import Link from 'next/link';
import { listUniverseOptions } from '@/lib/market-data/universe';
import DailyReviewClient from '@/components/review/DailyReviewClient';

export default async function DailyReviewPage() {
    const universes = listUniverseOptions().filter((u) => u.symbolCount !== null);

    return (
        <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-white">Daily Review</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        What changed since the previous completed session, for every instrument OSTRADE tracks.
                    </p>
                </div>
                <Link href="/review/weekly" className="text-sm font-medium text-teal-400 hover:underline">
                    Weekly Review →
                </Link>
            </div>
            <DailyReviewClient universes={universes} />
        </div>
    );
}

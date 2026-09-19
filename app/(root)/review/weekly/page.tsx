import Link from 'next/link';
import { listUniverseOptions } from '@/lib/market-data/universe';
import WeeklyReviewClient from '@/components/review/WeeklyReviewClient';

export default async function WeeklyReviewPage() {
    const universes = listUniverseOptions().filter((u) => u.symbolCount !== null);

    return (
        <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-white">Weekly Review</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        A trailing-week view alongside the daily scan — not a replacement for it.
                    </p>
                </div>
                <Link href="/review" className="text-sm font-medium text-teal-400 hover:underline">
                    ← Daily Review
                </Link>
            </div>
            <WeeklyReviewClient universes={universes} />
        </div>
    );
}

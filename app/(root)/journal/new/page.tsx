import { Suspense } from 'react';
import LogTradeForm from '@/components/journal/LogTradeForm';

export default function NewTradePage() {
    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Log Trade</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Record a trade you actually took. Position sizing is a calculator only — nothing here is
                    persisted as account state.
                </p>
            </div>
            <Suspense fallback={<div className="text-sm text-gray-500">Loading form…</div>}>
                <LogTradeForm />
            </Suspense>
        </div>
    );
}

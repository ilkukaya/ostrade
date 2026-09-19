import ScannerClient from '@/components/scanner/ScannerClient';
import { getUniverseOptions } from '@/lib/actions/scanner.actions';

export default async function ScannerPage() {
    const universes = await getUniverseOptions();

    return (
        <div className="mx-auto max-w-7xl">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-white">Swing Scanner</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Scans a symbol universe with the same deterministic rule engine used on the stock detail page —
                    every score here is explainable, never a black box. Research output, not investment advice.
                </p>
            </div>
            <ScannerClient universes={universes} />
        </div>
    );
}

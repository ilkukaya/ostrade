'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { saveCandidate } from '@/lib/actions/candidate.actions';

export default function SaveCandidateButton({ symbol, className }: { symbol: string; className?: string }) {
    const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');

    const handleClick = async () => {
        setState('saving');
        try {
            const outcome = await saveCandidate(symbol);
            if (outcome.success) {
                setState('saved');
                toast.success(`${symbol} saved as a candidate`, {
                    description: 'A snapshot of this analysis was recorded — view it on the Candidates page.',
                });
            } else {
                setState('idle');
                toast.error('Could not save candidate', { description: outcome.error });
            }
        } catch (error) {
            setState('idle');
            toast.error('Could not save candidate', {
                description: error instanceof Error ? error.message : 'Unexpected error.',
            });
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={state !== 'idle'}
            className={
                className ??
                'flex items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-black/50 disabled:opacity-60'
            }
            title="Save an immutable snapshot of this analysis to the Candidates page"
        >
            {state === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : state === 'saved' ? (
                <BookmarkCheck className="h-4 w-4 text-emerald-400" />
            ) : (
                <Bookmark className="h-4 w-4" />
            )}
            {state === 'saved' ? 'Saved' : 'Save Candidate'}
        </button>
    );
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

let currentUserId: string | null = 'user-1';
vi.mock('@/lib/better-auth/auth', () => ({
    getAuth: vi.fn(async () => ({
        api: {
            getSession: vi.fn(async () => (currentUserId ? { user: { id: currentUserId } } : null)),
        },
    })),
}));

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

const mockFindOneAndUpdate = vi.fn(async (query: Record<string, unknown>, doc: Record<string, unknown>, opts?: unknown) => { void opts; return { _id: 'item-1', ...query, ...doc }; });
const mockFindOneAndDelete = vi.fn(async (query: Record<string, unknown>) => { void query; return {}; });
const mockFind = vi.fn((query: Record<string, unknown>) => { void query; return { sort: vi.fn(async () => []) }; });
const mockFindOne = vi.fn(async (query: Record<string, unknown>) => { void query; return null; });
vi.mock('@/database/models/watchlist.model', () => ({
    Watchlist: {
        findOneAndUpdate: (...args: [Record<string, unknown>, Record<string, unknown>, unknown?]) => mockFindOneAndUpdate(...args),
        findOneAndDelete: (...args: [Record<string, unknown>]) => mockFindOneAndDelete(...args),
        find: (...args: [Record<string, unknown>]) => mockFind(...args),
        findOne: (...args: [Record<string, unknown>]) => mockFindOne(...args),
    },
}));

import { addToWatchlist, getUserWatchlist, isStockInWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';

describe('watchlist.actions (authorization)', () => {
    beforeEach(() => {
        currentUserId = 'user-1';
        mockFindOneAndUpdate.mockClear();
        mockFindOneAndDelete.mockClear();
        mockFind.mockClear();
        mockFindOne.mockClear();
    });

    it('rejects every export when there is no session', async () => {
        currentUserId = null;

        await expect(addToWatchlist('AAPL', 'Apple')).rejects.toThrow('Not authenticated');
        await expect(removeFromWatchlist('AAPL')).rejects.toThrow('Not authenticated');
        await expect(getUserWatchlist()).rejects.toThrow('Not authenticated');
        await expect(isStockInWatchlist('AAPL')).rejects.toThrow('Not authenticated');

        expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
        expect(mockFindOneAndDelete).not.toHaveBeenCalled();
    });

    it('scopes addToWatchlist to the session user, never a client-supplied one', async () => {
        await addToWatchlist('aapl', 'Apple');

        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'user-1', symbol: 'AAPL' },
            expect.objectContaining({ userId: 'user-1', symbol: 'AAPL', company: 'Apple' }),
            { upsert: true, new: true },
        );
    });

    it('scopes removeFromWatchlist to {userId, symbol}', async () => {
        await removeFromWatchlist('aapl');
        expect(mockFindOneAndDelete).toHaveBeenCalledWith({ userId: 'user-1', symbol: 'AAPL' });
    });

    it('scopes getUserWatchlist and isStockInWatchlist to the session user', async () => {
        await getUserWatchlist();
        expect(mockFind).toHaveBeenCalledWith({ userId: 'user-1' });

        await isStockInWatchlist('aapl');
        expect(mockFindOne).toHaveBeenCalledWith({ userId: 'user-1', symbol: 'AAPL' });
    });
});

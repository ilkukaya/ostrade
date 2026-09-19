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

const mockCreate = vi.fn(async (doc: Record<string, unknown>) => ({ _id: 'alert-1', ...doc }));
const mockFind = vi.fn((query: Record<string, unknown>) => { void query; return { sort: vi.fn(async () => []) }; });
const mockFindOneAndDelete = vi.fn(async (query: Record<string, unknown>) => { void query; return {}; });
const mockFindOneAndUpdate = vi.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => { void query; void update; return {}; });
vi.mock('@/database/models/alert.model', () => ({
    Alert: {
        create: (...args: [Record<string, unknown>]) => mockCreate(...args),
        find: (...args: [Record<string, unknown>]) => mockFind(...args),
        findOneAndDelete: (...args: [Record<string, unknown>]) => mockFindOneAndDelete(...args),
        findOneAndUpdate: (...args: [Record<string, unknown>, Record<string, unknown>]) => mockFindOneAndUpdate(...args),
    },
}));

import { createAlert, deleteAlert, getUserAlerts, toggleAlert } from '@/lib/actions/alert.actions';

describe('alert.actions (authorization)', () => {
    beforeEach(() => {
        currentUserId = 'user-1';
        mockCreate.mockClear();
        mockFind.mockClear();
        mockFindOneAndDelete.mockClear();
        mockFindOneAndUpdate.mockClear();
    });

    it('rejects createAlert, getUserAlerts, deleteAlert and toggleAlert when there is no session', async () => {
        currentUserId = null;

        await expect(createAlert({ symbol: 'AAPL', targetPrice: 100, condition: 'ABOVE' })).rejects.toThrow('Not authenticated');
        await expect(getUserAlerts()).rejects.toThrow('Not authenticated');
        await expect(deleteAlert('alert-1')).rejects.toThrow('Not authenticated');
        await expect(toggleAlert('alert-1', false)).rejects.toThrow('Not authenticated');

        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockFindOneAndDelete).not.toHaveBeenCalled();
        expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('creates an alert tagged with the session user, never a client-supplied one', async () => {
        await createAlert({ symbol: 'aapl', targetPrice: 150, condition: 'ABOVE' });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'user-1', symbol: 'aapl', targetPrice: 150 }),
        );
    });

    it('scopes getUserAlerts to the session user', async () => {
        await getUserAlerts();
        expect(mockFind).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('scopes deleteAlert to {_id, userId} so an alert ID alone cannot touch another user\'s alert', async () => {
        await deleteAlert('alert-1');
        expect(mockFindOneAndDelete).toHaveBeenCalledWith({ _id: 'alert-1', userId: 'user-1' });
    });

    it('scopes toggleAlert to {_id, userId} the same way', async () => {
        await toggleAlert('alert-1', false);
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith({ _id: 'alert-1', userId: 'user-1' }, { active: false });
    });
});

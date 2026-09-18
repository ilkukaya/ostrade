import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findOneMock = vi.fn();

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({
        connection: {
            db: {
                collection: () => ({ findOne: findOneMock }),
            },
        },
    })),
}));

import { connectToDatabase } from '@/database/mongoose';
import {
    getAuthorizedEmail,
    isEmailAuthorized,
    isPrivateModeEnabled,
    ownerAccountExists,
} from '@/lib/private-access';

describe('private-access', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
        findOneMock.mockReset();
        vi.mocked(connectToDatabase).mockClear();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('getAuthorizedEmail / isPrivateModeEnabled', () => {
        it('returns null and disabled when AUTHORIZED_EMAIL is unset', () => {
            delete process.env.AUTHORIZED_EMAIL;
            expect(getAuthorizedEmail()).toBeNull();
            expect(isPrivateModeEnabled()).toBe(false);
        });

        it('trims and lowercases a configured value', () => {
            process.env.AUTHORIZED_EMAIL = '  Owner@Example.com  ';
            expect(getAuthorizedEmail()).toBe('owner@example.com');
            expect(isPrivateModeEnabled()).toBe(true);
        });

        it('treats a blank string the same as unset', () => {
            process.env.AUTHORIZED_EMAIL = '   ';
            expect(getAuthorizedEmail()).toBeNull();
            expect(isPrivateModeEnabled()).toBe(false);
        });
    });

    describe('isEmailAuthorized', () => {
        it('allows any email when no allowlist is configured', () => {
            delete process.env.AUTHORIZED_EMAIL;
            expect(isEmailAuthorized('anyone@example.com')).toBe(true);
        });

        it('allows only the configured email, case-insensitively', () => {
            process.env.AUTHORIZED_EMAIL = 'owner@example.com';
            expect(isEmailAuthorized('Owner@Example.com')).toBe(true);
            expect(isEmailAuthorized('  owner@example.com  ')).toBe(true);
            expect(isEmailAuthorized('someone-else@example.com')).toBe(false);
        });
    });

    describe('ownerAccountExists', () => {
        it('returns false when no allowlist is configured (no DB lookup performed)', async () => {
            delete process.env.AUTHORIZED_EMAIL;
            expect(await ownerAccountExists()).toBe(false);
            expect(connectToDatabase).not.toHaveBeenCalled();
        });

        it('returns true when the authorized email already has an account', async () => {
            process.env.AUTHORIZED_EMAIL = 'owner@example.com';
            findOneMock.mockResolvedValue({ email: 'owner@example.com' });
            expect(await ownerAccountExists()).toBe(true);
            expect(findOneMock).toHaveBeenCalledWith({ email: 'owner@example.com' });
        });

        it('returns false when no account exists yet for the authorized email', async () => {
            process.env.AUTHORIZED_EMAIL = 'owner@example.com';
            findOneMock.mockResolvedValue(null);
            expect(await ownerAccountExists()).toBe(false);
        });

        it('fails open (returns false) if the database lookup throws', async () => {
            process.env.AUTHORIZED_EMAIL = 'owner@example.com';
            vi.mocked(connectToDatabase).mockRejectedValueOnce(new Error('connection refused'));
            expect(await ownerAccountExists()).toBe(false);
        });
    });
});

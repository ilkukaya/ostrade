import { connectToDatabase } from '@/database/mongoose';

/**
 * Private-terminal access control.
 *
 * When AUTHORIZED_EMAIL is unset, the app behaves like vanilla OSTRADE
 * (open sign-up) — this is the default before an owner has configured their
 * private deployment. Once set, it is the only email allowed to hold an
 * account; every other sign-up attempt is rejected server-side regardless of
 * how the request reaches the sign-up action.
 */

export function getAuthorizedEmail(): string | null {
    const value = process.env.AUTHORIZED_EMAIL?.trim().toLowerCase();
    return value ? value : null;
}

export function isPrivateModeEnabled(): boolean {
    return getAuthorizedEmail() !== null;
}

export function isEmailAuthorized(email: string): boolean {
    const authorizedEmail = getAuthorizedEmail();
    if (!authorizedEmail) return true;
    return email.trim().toLowerCase() === authorizedEmail;
}

/**
 * Whether the owner account (the one matching AUTHORIZED_EMAIL) has already
 * been created. Used only to decide whether to keep showing the sign-up
 * form — the real security boundary is isEmailAuthorized(), enforced in the
 * sign-up server action itself. Fails open (returns false) on DB errors so a
 * transient outage can't lock the owner out of first-time setup.
 */
export async function ownerAccountExists(): Promise<boolean> {
    const authorizedEmail = getAuthorizedEmail();
    if (!authorizedEmail) return false;

    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) return false;

        const existing = await db.collection('user').findOne({ email: authorizedEmail });
        return !!existing;
    } catch (error) {
        console.error('Failed to check owner account existence:', error);
        return false;
    }
}

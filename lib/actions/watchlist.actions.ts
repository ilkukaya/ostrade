'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { revalidatePath } from 'next/cache';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

// -- CRUD Operations --
// `userId` is always derived from the session below, never trusted from the
// caller — see docs/architecture.md's "server actions cannot be anonymously
// invoked" requirement.

export async function addToWatchlist(symbol: string, company: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();

        // Upsert to avoid duplicates/errors if it already exists
        const newItem = await Watchlist.findOneAndUpdate(
            { userId, symbol: symbol.toUpperCase() },
            {
                userId,
                symbol: symbol.toUpperCase(),
                company,
                addedAt: new Date()
            },
            { upsert: true, new: true }
        );

        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newItem));
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        throw new Error('Failed to add to watchlist');
    }
}

export async function removeFromWatchlist(symbol: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        await Watchlist.findOneAndDelete({ userId, symbol: symbol.toUpperCase() });
        revalidatePath('/watchlist');
        revalidatePath('/'); // In case it's used elsewhere
        return { success: true };
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        throw new Error('Failed to remove from watchlist');
    }
}

export async function getUserWatchlist() {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });
        return JSON.parse(JSON.stringify(watchlist));
    } catch (error) {
        console.error('Error fetching watchlist:', error);
        return [];
    }
}

// Check if a symbol is in the signed-in owner's watchlist
export async function isStockInWatchlist(symbol: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const item = await Watchlist.findOne({ userId, symbol: symbol.toUpperCase() });
        return !!item;
    } catch (error) {
        console.error('Error checking watchlist status:', error);
        return false;
    }
}

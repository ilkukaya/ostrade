'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Alert } from '@/database/models/alert.model';
import { revalidatePath } from 'next/cache';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

// Create a new alert for the signed-in owner. `userId` is derived from the
// session, never trusted from the caller — see docs/architecture.md's
// "server actions cannot be anonymously invoked" requirement.
export async function createAlert(params: {
    symbol: string;
    targetPrice: number;
    condition: 'ABOVE' | 'BELOW';
}) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const newAlert = await Alert.create({
            ...params,
            userId,
            active: true,
            // expiresAt handled by default value in schema
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newAlert));
    } catch (error) {
        console.error('Error creating alert:', error);
        throw new Error('Failed to create alert');
    }
}

// Get all alerts for the signed-in owner.
export async function getUserAlerts() {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 });
        return JSON.parse(JSON.stringify(alerts));
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return [];
    }
}

// Delete an alert — scoped to the signed-in owner's own alerts, so an alert
// ID alone is never enough to touch another user's record.
export async function deleteAlert(alertId: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        await Alert.findOneAndDelete({ _id: alertId, userId });
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error deleting alert:', error);
        throw new Error('Failed to delete alert');
    }
}

// Toggle alert active status (optional utility) — same ownership scoping as deleteAlert.
export async function toggleAlert(alertId: string, active: boolean) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        await Alert.findOneAndUpdate({ _id: alertId, userId }, { active });
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error toggling alert:', error);
        throw new Error('Failed to update alert');
    }
}

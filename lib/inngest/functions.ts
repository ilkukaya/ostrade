import { inngest } from "@/lib/inngest/client";
import { PERSONALIZED_WELCOME_EMAIL_PROMPT } from "@/lib/inngest/prompts";
import { sendWelcomeEmail } from "@/lib/nodemailer";
import { callAIProviderWithFallback } from "@/lib/ai-provider";
import type { ActiveCandidateRecord } from "@/lib/candidates/updateOutcomes";

type AlertRecord = {
    _id: unknown;
    symbol: string;
    condition: 'ABOVE' | 'BELOW';
    targetPrice: number;
};

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email' },
    { event: 'app/user.created' },
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile)


        const introText = await step.run('generate-welcome-intro', async () => {
            try {
                return await callAIProviderWithFallback(prompt);
            } catch (error) {
                console.error("⚠️ All AI providers failed for welcome email", error);
                return 'Thanks for joining OSTRADE. You now have the tools to track markets and make smarter moves.';
            }
        });

        await step.run('send-welcome-email', async () => {
            try {

                const { data: { email, name } } = event;
                // introText is already a plain string from the AI provider

                console.log(`📧 Attempting to send welcome email to: ${email}`);
                const result = await sendWelcomeEmail({ email, name, intro: introText });
                console.log(`✅ Welcome email sent successfully to: ${email}`);
                return result;
            } catch (error) {
                console.error('❌ Error sending welcome email:', error);
                throw error;
            }
        })

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }
    }
)

export const checkStockAlerts = inngest.createFunction(
    { id: 'check-stock-alerts' },
    { cron: '*/5 * * * *' }, // Run every 5 minutes
    async ({ step }) => {
        // Step 1: Fetch active alerts
        const activeAlerts = await step.run('fetch-active-alerts', async () => {
            // Dynamic import to avoid circular dep issues if any, or just standard import
            const { connectToDatabase } = await import("@/database/mongoose");
            const { Alert } = await import("@/database/models/alert.model");

            await connectToDatabase();
            const now = new Date();

            return await Alert.find({
                active: true,
                triggered: false,
                expiresAt: { $gt: now }
            }).lean();
        });

        if (!activeAlerts || activeAlerts.length === 0) {
            return { message: 'No active alerts to check.' };
        }

        // Step 2: Group by symbol
        const typedAlerts = activeAlerts as unknown as AlertRecord[];
        const symbols = [...new Set(typedAlerts.map((a) => a.symbol))];

        // Step 3: Fetch prices — calls lib/market-data/service.ts directly
        // rather than lib/actions/finnhub.actions.ts, since this cron runs
        // with no user session at all and that file's exports now require
        // one (see finnhub.actions.ts's own doc comment).
        const prices = await step.run('fetch-prices', async () => {
            const { getQuote } = await import("@/lib/market-data/service");
            const priceMap: Record<string, number> = {};

            // Process in chunks to be safe
            for (const sym of symbols) {
                try {
                    const result = await getQuote(sym as string);
                    if (result.ok && result.data.price) {
                        priceMap[sym as string] = result.data.price;
                    }
                } catch (e) {
                    console.error(`Failed to fetch price for ${sym}`, e);
                }
            }
            return priceMap;
        });

        // Step 4: Check conditions
        type TriggeredAlert = { alert: AlertRecord; currentPrice: number };
        const triggeredAlerts: TriggeredAlert[] = [];

        for (const alert of activeAlerts as unknown as AlertRecord[]) {
            const currentPrice = prices[alert.symbol];
            if (!currentPrice) continue;

            let isTriggered = false;
            // Simple check
            if (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) {
                isTriggered = true;
            } else if (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice) {
                isTriggered = true;
            }

            if (isTriggered) {
                triggeredAlerts.push({ alert, currentPrice });
            }
        }

        // Step 5: Process triggers
        if (triggeredAlerts.length > 0) {
            await step.run('process-triggered-alerts', async () => {
                const { connectToDatabase } = await import("@/database/mongoose");
                const { Alert } = await import("@/database/models/alert.model");
                // TODO: send an email notification once alert-triggered emails are wired up
                // (STOCK_ALERT_UPPER_EMAIL_TEMPLATE / STOCK_ALERT_LOWER_EMAIL_TEMPLATE already exist).
                await connectToDatabase();

                for (const { alert, currentPrice } of triggeredAlerts) {
                    console.log(`🚀 ALERT FIRED: ${alert.symbol} is ${currentPrice} (${alert.condition} ${alert.targetPrice})`);

                    // Mark triggered
                    await Alert.findByIdAndUpdate(alert._id, { triggered: true, active: false });
                }
            });
        }

        return {
            processed: activeAlerts.length,
            triggered: triggeredAlerts.length
        };
    }
);

/**
 * Walks every ACTIVE candidate forward through the daily bars since its
 * signal to see whether its target(s) or stop have since been hit — see
 * lib/candidates/updateOutcomes.ts for the local-first update logic,
 * lib/candidates/outcome.ts for the (deterministic, no-look-ahead)
 * detection it uses, and docs/candidates.md for the lifecycle it writes.
 * Runs once daily, after daily bars for the session are expected to be
 * available — checking more often than that has no effect, since nothing
 * about a completed trading day's outcome changes intraday.
 *
 * Cron ordering (see docs/daily-data-engine.md): this is meant to run
 * AFTER that day's market-data sync and daily-analysis-snapshot generation
 * (once those exist as scheduled jobs — today, market-data sync is
 * manual-only via /data, and there is no automatic snapshot job yet), so it
 * always reads the same day's freshly-synced bars rather than yesterday's.
 */
export const checkCandidateOutcomes = inngest.createFunction(
    { id: 'check-candidate-outcomes' },
    { cron: '0 22 * * *' },
    async ({ step }) => {
        const activeCandidates = await step.run('fetch-active-candidates', async () => {
            const { connectToDatabase } = await import("@/database/mongoose");
            const { Candidate } = await import("@/database/models/candidate.model");

            await connectToDatabase();
            return await Candidate.find({ status: 'ACTIVE' }, { symbol: 1, signalAt: 1, price: 1, stopLevel: 1, targets: 1 }).lean();
        });

        if (!activeCandidates || activeCandidates.length === 0) {
            return { message: 'No active candidates to check.' };
        }

        const result = await step.run('evaluate-and-update-outcomes', async () => {
            const { updateActiveCandidateOutcomes } = await import("@/lib/candidates/updateOutcomes");
            return updateActiveCandidateOutcomes(activeCandidates as unknown as ActiveCandidateRecord[]);
        });

        return {
            processed: activeCandidates.length,
            updated: result.updated,
            failed: result.failed,
        };
    },
);

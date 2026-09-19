import { inngest } from "@/lib/inngest/client";
import { PERSONALIZED_WELCOME_EMAIL_PROMPT } from "@/lib/inngest/prompts";
import { sendWelcomeEmail } from "@/lib/nodemailer";
import { callAIProviderWithFallback } from "@/lib/ai-provider";
import { createConcurrencyLimiter } from "@/lib/concurrencyLimiter";
import { evaluateCandidateOutcome } from "@/lib/candidates/outcome";

type AlertRecord = {
    _id: unknown;
    symbol: string;
    condition: 'ABOVE' | 'BELOW';
    targetPrice: number;
};

type CandidateRecord = {
    _id: unknown;
    symbol: string;
    signalAt: string | Date;
    stopLevel?: number;
    targets?: number[];
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
                return 'Thanks for joining Openstock. You now have the tools to track markets and make smarter moves.';
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
        const typedAlerts = activeAlerts as AlertRecord[];
        const symbols = [...new Set(typedAlerts.map((a) => a.symbol))];

        // Step 3: Fetch prices
        const prices = await step.run('fetch-prices', async () => {
            const { getQuote } = await import("@/lib/actions/finnhub.actions");
            const priceMap: Record<string, number> = {};

            // Process in chunks to be safe
            for (const sym of symbols) {
                try {
                    const quote = await getQuote(sym as string);
                    if (quote && quote.price) {
                        priceMap[sym as string] = quote.price;
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

        for (const alert of activeAlerts as AlertRecord[]) {
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
 * lib/candidates/outcome.ts for the (deterministic, no-look-ahead)
 * detection logic and docs/candidates.md for the lifecycle it writes.
 * Runs once daily, after daily bars for the session are expected to be
 * available — checking more often than that has no effect, since nothing
 * about a completed trading day's outcome changes intraday.
 */
export const checkCandidateOutcomes = inngest.createFunction(
    { id: 'check-candidate-outcomes' },
    { cron: '0 22 * * *' },
    async ({ step }) => {
        const activeCandidates = await step.run('fetch-active-candidates', async () => {
            const { connectToDatabase } = await import("@/database/mongoose");
            const { Candidate } = await import("@/database/models/candidate.model");

            await connectToDatabase();
            return await Candidate.find({ status: 'ACTIVE' }, { symbol: 1, signalAt: 1, stopLevel: 1, targets: 1 }).lean();
        });

        if (!activeCandidates || activeCandidates.length === 0) {
            return { message: 'No active candidates to check.' };
        }

        const result = await step.run('evaluate-and-update-outcomes', async () => {
            const { connectToDatabase } = await import("@/database/mongoose");
            const { Candidate } = await import("@/database/models/candidate.model");
            const { getHistoricalPrices } = await import("@/lib/market-data/service");

            await connectToDatabase();

            const limit = createConcurrencyLimiter(4);
            let updated = 0;
            let failed = 0;

            await Promise.all(
                (activeCandidates as CandidateRecord[]).map((candidate) =>
                    limit(async () => {
                        try {
                            const barsResult = await getHistoricalPrices(candidate.symbol, 'D');
                            if (!barsResult.ok) return;

                            const signalDateStr = new Date(candidate.signalAt).toISOString().slice(0, 10);
                            const barsAfterSignal = barsResult.data.filter((b) => b.time > signalDateStr);

                            const outcome = evaluateCandidateOutcome({
                                stopLevel: candidate.stopLevel,
                                targets: candidate.targets,
                                barsAfterSignal,
                            });

                            if (outcome.status !== 'ACTIVE') {
                                await Candidate.findByIdAndUpdate(candidate._id, { $set: outcome });
                                updated++;
                                console.log(`📈 Candidate ${candidate.symbol} (${candidate._id}) resolved: ${outcome.status}`);
                            }
                        } catch (error) {
                            failed++;
                            console.error(`Failed to evaluate outcome for candidate ${candidate._id} (${candidate.symbol})`, error);
                        }
                    }),
                ),
            );

            return { updated, failed };
        });

        return {
            processed: activeCandidates.length,
            updated: result.updated,
            failed: result.failed,
        };
    },
);

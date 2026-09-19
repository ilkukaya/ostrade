import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms',
    description: 'OSTRADE research-use terms and limitations.',
};

export default function TermsPage() {
    return (
        <div className="mx-auto max-w-4xl space-y-8 pb-20 pt-8">
            <div>
                <h1 className="text-4xl font-black tracking-tight text-foreground">Research-use terms</h1>
                <p className="mt-3 text-sm text-muted-foreground">Last updated: September 19, 2026</p>
            </div>

            <Section title="Research tool, not financial advice">
                OSTRADE is an educational and analytical research terminal. Scanner results, scores, candidates,
                backtests, Monte Carlo simulations and portfolio analytics are not recommendations to buy, sell or hold securities.
            </Section>
            <Section title="Data limitations">
                Market data can be delayed, missing, revised or incorrect. Free and unofficial data sources can change without notice.
                Important prices and corporate actions should be independently verified before any real-world decision.
            </Section>
            <Section title="Backtest limitations">
                Historical simulations are not live trading. Results can be affected by survivorship bias, slippage assumptions,
                fees, data quality, incomplete corporate-action handling and the absence of point-in-time index membership.
            </Section>
            <Section title="Private deployment">
                This build is configured as an owner-only private terminal. Do not treat its authentication model, data sources or
                operational assumptions as a ready-made public commercial service without a separate security, privacy and legal review.
            </Section>
            <Section title="Open-source notices">
                Third-party and upstream license notices remain in the source repository and continue to apply to the corresponding code.
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="text-lg font-bold text-foreground">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p></section>;
}

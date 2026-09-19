import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BarChart3, Database, ShieldCheck, Sparkles } from "lucide-react";
import BrandWordmark from "@/components/BrandWordmark";
import ThemeToggle from "@/components/ThemeToggle";
import { getAuth } from "@/lib/better-auth/auth";

export const dynamic = 'force-dynamic';

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (session?.user) redirect('/');

    return (
        <main className="auth-layout">
            <section className="auth-left-section scrollbar-hide-default">
                <div className="auth-logo flex items-center justify-between gap-4">
                    <BrandWordmark />
                    <ThemeToggle compact />
                </div>

                <div className="flex-1 pb-6 lg:pb-8">
                    {children}
                </div>
            </section>

            <section className="auth-right-section">
                <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center">
                    <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
                        Private research workspace
                    </div>
                    <h2 className="max-w-xl text-4xl font-black tracking-tight text-foreground lg:text-5xl">
                        Research the setup.
                        <span className="block text-teal-600 dark:text-teal-300">Not the noise.</span>
                    </h2>
                    <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
                        OSTRADE turns end-of-day market data into an explainable swing-trading workflow:
                        scan, review, save candidates, backtest and measure risk from one private terminal.
                    </p>

                    <div className="mt-10 grid gap-3 sm:grid-cols-2">
                        <Feature icon={<BarChart3 className="h-4 w-4" />} title="Explainable setups" text="Every score is backed by visible rules." />
                        <Feature icon={<Database className="h-4 w-4" />} title="Local-first EOD data" text="BIST and US research from stored daily bars." />
                        <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Private by design" text="Owner-only access and server-side authorization." />
                        <Feature icon={<Sparkles className="h-4 w-4" />} title="Research workflow" text="Daily review, candidates, backtests and Monte Carlo." />
                    </div>
                </div>
            </section>
        </main>
    );
};

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-border bg-card/75 p-4 shadow-sm">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-300">
                {icon}
            </div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
        </div>
    );
}

export default Layout;

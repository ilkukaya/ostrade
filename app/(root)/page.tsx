import TradingViewWidget from "@/components/TradingViewWidget";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG
} from "@/lib/constants";
import { listCandidates } from "@/lib/actions/candidate.actions";
import { listTrades } from "@/lib/actions/trade.actions";
import { computeOverallCandidateStats } from "@/lib/statistics/candidateStats";
import { computeOverallTradeStats } from "@/lib/statistics/tradeStats";
import ResearchSummary, { QuickLinks } from "@/components/dashboard/ResearchSummary";
import ResearchPulse from "@/components/dashboard/ResearchPulse";
import { getDashboardResearchPulse, getWatchlistChangeSummary } from "@/lib/actions/review.actions";

const Home = async () => {
    const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

    const [candidates, trades, researchPulse, watchlistChanges] = await Promise.all([
        listCandidates(),
        listTrades(),
        getDashboardResearchPulse(),
        getWatchlistChangeSummary(),
    ]);
    const candidateStats = computeOverallCandidateStats(candidates);
    const tradeStats = computeOverallTradeStats(trades);

    return (
        <div className="flex min-h-screen home-wrapper">
            <ResearchPulse pulse={researchPulse} watchlistChanges={watchlistChanges} />
            <ResearchSummary
                activeCandidateCount={candidateStats.activeCount}
                openTradeCount={tradeStats.openCount}
                closedTradeCount={tradeStats.closedCount}
                closedTradeWinRate={tradeStats.winRate}
            />
            <QuickLinks />
            <section className="grid w-full gap-8 home-section">
                <div className="md:col-span-1 xl:col-span-1">
                    <TradingViewWidget
                        title="Market Overview"
                        scriptUrl={`${scriptUrl}market-overview.js`}
                        config={MARKET_OVERVIEW_WIDGET_CONFIG}
                        className="custom-chart"
                        height={600}
                    />
                </div>
                <div className="md-col-span xl:col-span-2">
                    <TradingViewWidget
                        title="Stock Heatmap"
                        scriptUrl={`${scriptUrl}stock-heatmap.js`}
                        config={HEATMAP_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
            </section>
            <section className="grid w-full gap-8 home-section">
                <div className="h-full md:col-span-1 xl:col-span-2">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
                <div className="h-full md:col-span-1 xl:col-span-1">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        height={600}
                    />
                </div>

            </section>
        </div>
    )
}

export default Home;
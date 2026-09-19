import Link from "next/link";
import BrandWordmark from "@/components/BrandWordmark";

const Footer = () => {
    return (
        <footer className="border-t border-border bg-card/60 text-foreground">
            <div className="container mx-auto px-4 py-10">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <div className="col-span-1 md:col-span-2">
                        <BrandWordmark />
                        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            OSTRADE is a private swing-trading research terminal for daily market review,
                            explainable technical setups, backtesting, candidate tracking and risk analysis.
                        </p>
                        <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground/80">
                            Research output only. Market data and model outputs can be incomplete, delayed or wrong;
                            verify important decisions independently.
                        </p>
                    </div>

                    <div>
                        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Resources</h3>
                        <ul className="space-y-2 text-sm">
                            <li><Link href="/api-docs" className="footer-link">Architecture</Link></li>
                            <li><Link href="/help" className="footer-link">Help</Link></li>
                            <li><Link href="/terms" className="footer-link">Terms</Link></li>
                            <li>
                                <Link href="https://github.com/ilkukaya/ostrade" target="_blank" rel="noopener noreferrer" className="footer-link">
                                    Source repository
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <span>© {new Date().getFullYear()} OSTRADE.</span>
                    <span>Open-source license notices remain available in the source repository.</span>
                </div>
            </div>
        </footer>
    );
};

export default Footer;

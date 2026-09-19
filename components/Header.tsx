import NavItems from "@/components/NavItems";
import UserDropdown from "@/components/UserDropdown";
import BrandWordmark from "@/components/BrandWordmark";
import ThemeToggle from "@/components/ThemeToggle";
import { searchStocks } from "@/lib/actions/finnhub.actions";

const Header = async ({ user }: { user: User }) => {
    const initialStocks = await searchStocks();

    return (
        <header className="sticky top-0 header">
            <div className="container header-wrapper">
                <BrandWordmark />
                <nav className="hidden sm:block">
                    <NavItems initialStocks={initialStocks} />
                </nav>
                <div className="flex items-center gap-2">
                    <div className="hidden lg:block">
                        <ThemeToggle compact />
                    </div>
                    <UserDropdown user={user} initialStocks={initialStocks} />
                </div>
            </div>
        </header>
    );
};

export default Header;

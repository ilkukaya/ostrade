import Header from "@/components/Header";
import { getAuth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Footer from "@/components/Footer";
import DonatePopup from "@/components/DonatePopup";
import SirayBanner from "@/components/SirayBanner";

// This entire route tree is session-specific (auth, watchlist, alerts) and must
// never be statically prerendered or cached — the private terminal has no
// public/anonymous view of its own pages.
export const dynamic = 'force-dynamic';

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) redirect('/sign-in');

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }

    return (
        <main className="min-h-screen text-gray-400">
            <SirayBanner />
            <Header user={user} />

            <div className="container py-10">
                {children}
            </div>

            <Footer />
            <DonatePopup />
        </main>
    )
}
export default Layout
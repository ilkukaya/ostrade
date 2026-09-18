import { redirect } from "next/navigation";
import { isPrivateModeEnabled, ownerAccountExists } from "@/lib/private-access";
import SignUpForm from "./SignUpForm";

const SignUpPage = async () => {
    // Once this private deployment's owner account exists, there is no
    // legitimate reason to keep showing the sign-up form — the account is
    // created once, per section 5 of the deployment brief ("disable public
    // signup after initial owner account creation"). The sign-up action
    // itself is the real security boundary (lib/private-access.ts) and keeps
    // rejecting non-owner emails regardless of this page-level redirect.
    if (isPrivateModeEnabled() && (await ownerAccountExists())) {
        redirect('/sign-in');
    }

    return <SignUpForm />;
};

export default SignUpPage;

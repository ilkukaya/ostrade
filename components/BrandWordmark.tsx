import Link from 'next/link';

type BrandWordmarkProps = {
    href?: string;
    compact?: boolean;
    className?: string;
};

export default function BrandWordmark({ href = '/', compact = false, className = '' }: BrandWordmarkProps) {
    const content = (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <span className="relative grid h-8 w-8 place-items-center rounded-xl border border-teal-500/25 bg-teal-500/10 shadow-[0_0_24px_rgba(20,184,166,0.12)]">
                <span className="absolute inset-[6px] rounded-full border border-teal-400/40" />
                <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_14px_rgba(45,212,191,0.7)]" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
                <span className="text-[17px] font-black tracking-[0.22em] text-foreground">OSTRADE</span>
                {!compact ? (
                    <span className="mt-1 hidden text-[9px] font-medium tracking-[0.18em] text-muted-foreground lg:block">
                        SWING RESEARCH TERMINAL
                    </span>
                ) : null}
            </span>
        </span>
    );

    return href ? <Link href={href}>{content}</Link> : content;
}

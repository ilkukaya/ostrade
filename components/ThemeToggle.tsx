'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';

const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
];

function applyTheme(theme: ThemePreference) {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = theme === 'dark' || (theme === 'system' && systemDark);
    root.classList.toggle('dark', shouldUseDark);
    root.dataset.theme = theme;
    root.style.colorScheme = shouldUseDark ? 'dark' : 'light';
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
    const [theme, setTheme] = useState<ThemePreference>('light');

    useEffect(() => {
        const stored = window.localStorage.getItem('ostrade-theme') as ThemePreference | null;
        const initial = stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'light';
        setTheme(initial);
        applyTheme(initial);

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onSystemChange = () => {
            const current = (window.localStorage.getItem('ostrade-theme') as ThemePreference | null) ?? 'light';
            if (current === 'system') applyTheme('system');
        };
        media.addEventListener('change', onSystemChange);
        return () => media.removeEventListener('change', onSystemChange);
    }, []);

    const choose = (next: ThemePreference) => {
        setTheme(next);
        window.localStorage.setItem('ostrade-theme', next);
        applyTheme(next);
    };

    return (
        <div className="inline-flex items-center rounded-lg border border-border bg-card/80 p-1 shadow-sm" aria-label="Theme">
            {options.map(({ value, label, icon: Icon }) => (
                <button
                    key={value}
                    type="button"
                    onClick={() => choose(value)}
                    title={label}
                    aria-label={`Use ${label.toLowerCase()} theme`}
                    aria-pressed={theme === value}
                    className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                        theme === value
                            ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                    <Icon className="h-3.5 w-3.5" />
                    {compact ? null : <span className="hidden xl:inline">{label}</span>}
                </button>
            ))}
        </div>
    );
}

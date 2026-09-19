import { describe, expect, it } from 'vitest';
import {
    STOCK_ALERT_LOWER_EMAIL_TEMPLATE,
    STOCK_ALERT_UPPER_EMAIL_TEMPLATE,
    VOLUME_ALERT_EMAIL_TEMPLATE,
    WELCOME_EMAIL_TEMPLATE,
} from '@/lib/nodemailer/templates';

const ALL_TEMPLATES = {
    WELCOME_EMAIL_TEMPLATE,
    STOCK_ALERT_UPPER_EMAIL_TEMPLATE,
    STOCK_ALERT_LOWER_EMAIL_TEMPLATE,
    VOLUME_ALERT_EMAIL_TEMPLATE,
};

describe('email templates', () => {
    it('never hardcode a link to another deployment — every "go to the app" link uses the {{dashboardUrl}} placeholder', () => {
        for (const [name, template] of Object.entries(ALL_TEMPLATES)) {
            expect(template, `${name} should not reference vercel.app`).not.toMatch(/vercel\.app/i);
            expect(template, `${name} should use the {{dashboardUrl}} placeholder at least once`).toContain('{{dashboardUrl}}');
        }
    });
});

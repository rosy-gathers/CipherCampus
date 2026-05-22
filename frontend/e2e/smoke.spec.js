const { test, expect } = require('@playwright/test');

test.describe('Smoke', () => {
    test('login route shows branding and register link', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'CipherCampus' })).toBeVisible();
        await expect(page.getByRole('link', { name: /Register/i })).toBeVisible();
    });

    test('register route loads', async ({ page }) => {
        await page.goto('/register');
        await expect(page.getByRole('button', { name: /register/i })).toBeVisible();
    });
});

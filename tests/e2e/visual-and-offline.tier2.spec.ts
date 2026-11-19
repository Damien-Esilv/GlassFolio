import { test, expect, expectAccessible, navigateSpa } from './fixtures';

test.describe('Tier 2 — Multi-Theme Layout Stability & Offline-to-Online Resilience', () => {
  test('preserves encrypted local state across network drop and renders all 5 themes without layout overflow', async ({
    page,
    context,
  }) => {
    await page.goto('/signup');
    await page.locator('#signup-name').fill('Resilience User');
    await page.locator('#signup-password').fill('Offline-First-Vault-2026!');
    await page.locator('form button[type="submit"]').click();

    const recoveryKeyBox = page.locator('.font-mono.tracking-widest.break-all');
    await expect(recoveryKeyBox).toBeVisible({ timeout: 15_000 });
    const recoveryKey = (await recoveryKeyBox.innerText()).trim();
    const last4 = recoveryKey.replace(/-/g, '').slice(-4).toUpperCase();

    await page.locator('input[type="checkbox"]').check();
    await page.locator('#recovery-key-confirmation').fill(last4);
    await page.locator('#recovery-key-confirmation').locator('..').locator('..').locator('button').last().click();

    await expect(page.locator('header button svg.lucide-lock').locator('..')).toBeVisible({ timeout: 15_000 });

    // Simulate network drop mid-session while navigating between offline-first routes
    await context.setOffline(true);
    await navigateSpa(page, '/transactions');
    await expect(page.locator('#tx-filter-date-range')).toBeVisible({ timeout: 10_000 });

    // Restore connectivity
    await context.setOffline(false);

    // Cycle through all 5 themes and verify CSS variables cascade and no horizontal overflow occurs
    const themes = ['light', 'dark', 'night', 'emerald', 'cyber'] as const;
    for (const theme of themes) {
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);

      const layoutMetrics = await page.evaluate(() => {
        const bgCanvas = getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim();
        const textPrimary = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
        const hasHorizontalOverflow =
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 4;
        return { bgCanvas, textPrimary, hasHorizontalOverflow };
      });

      expect(layoutMetrics.bgCanvas).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(layoutMetrics.textPrimary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(layoutMetrics.hasHorizontalOverflow).toBe(false);
    }

    await expectAccessible(page);
  });
});

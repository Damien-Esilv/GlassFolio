import { test, expect, expectAccessible, navigateSpa } from './fixtures';

test.describe('Critical Journey 3 — AI Chat Drawer Dialog Semantics, Focus Trap & Multi-Theme A11y', () => {
  test('traps keyboard Tab focus inside AIChatDrawer, closes on Escape, and passes WCAG audit in Cyber & Dark themes', async ({
    page,
  }) => {
    await page.goto('/signup');
    await page.locator('#signup-name').fill('A11y Auditor');
    await page.locator('#signup-password').fill('A11y-Strong-Vault-Pass-2026!');
    await page.locator('form button[type="submit"]').click();

    const recoveryKeyBox = page.locator('.font-mono.tracking-widest.break-all');
    await expect(recoveryKeyBox).toBeVisible({ timeout: 15_000 });
    const recoveryKey = (await recoveryKeyBox.innerText()).trim();
    const last4 = recoveryKey.replace(/-/g, '').slice(-4).toUpperCase();

    await page.locator('input[type="checkbox"]').check();
    await page.locator('#recovery-key-confirmation').fill(last4);
    await page.locator('#recovery-key-confirmation').locator('..').locator('..').locator('button').last().click();

    // Wait for Dashboard header
    const openAiBtn = page.locator('header button svg.lucide-sparkles').locator('..');
    await expect(openAiBtn).toBeVisible({ timeout: 15_000 });

    // Open AI Chat Drawer
    await openAiBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expectAccessible(page);

    // Tab 12 times and ensure focus never escapes the modal dialog
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const focusInsideDialog = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return Boolean(dlg && document.activeElement && dlg.contains(document.activeElement));
      });
      expect(focusInsideDialog).toBe(true);
    }

    // Close drawer via Escape key
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Switch to Cyber Neon theme and run full axe-core WCAG 2.1 AA audit
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'cyber');
    });
    await expectAccessible(page);

    // Switch to Dark theme and audit Settings page
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await navigateSpa(page, '/settings');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    await expectAccessible(page);
  });
});

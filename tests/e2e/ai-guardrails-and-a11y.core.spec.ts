import { test, expect, expectAccessible, navigateSpa } from './fixtures';

test.describe('Critical Journey 3 — Non-Modal AI Side Panel, Simultaneous Navigation & Multi-Theme A11y', () => {
  test('opens non-modal AI complementary panel without backdrop, keeps page interactive across navigation, closes on Escape inside panel, and passes WCAG audit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
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

    // Open AI Side Panel
    await openAiBtn.click();
    const panel = page.getByTestId('ai-chat-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'complementary');
    // Must not have aria-modal or dim backdrop
    expect(await panel.getAttribute('aria-modal')).toBeNull();
    await expectAccessible(page);

    // Main content stays interactive and clickable while panel is open
    const transactionsLink = page.getByTestId('desktop-sidebar').locator('a[href="/transactions"]');
    await transactionsLink.click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    // Panel stays open across SPA navigation (E50)
    await expect(panel).toBeVisible();

    // Escape closes panel only when focus is inside the panel
    await panel.locator('textarea').focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

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

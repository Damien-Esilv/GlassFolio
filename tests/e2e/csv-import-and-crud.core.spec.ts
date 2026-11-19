import { test, expect, expectAccessible, navigateSpa } from './fixtures';

async function onboardQuickLocalVault(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/signup');
  await page.locator('#signup-name').fill('Portfolio Trader');
  await page.locator('#signup-password').fill('Trader-Vault-Passphrase-2026!');
  await page.locator('form button[type="submit"]').click();

  const recoveryKeyBox = page.locator('.font-mono.tracking-widest.break-all');
  await expect(recoveryKeyBox).toBeVisible({ timeout: 15_000 });
  const recoveryKey = (await recoveryKeyBox.innerText()).trim();
  const last4 = recoveryKey.replace(/-/g, '').slice(-4).toUpperCase();

  await page.locator('input[type="checkbox"]').check();
  await page.locator('#recovery-key-confirmation').fill(last4);
  const continueBtn = page.locator('#recovery-key-confirmation').locator('..').locator('..').locator('button').last();
  await continueBtn.click();
  await expect(page.locator('header button svg.lucide-lock').locator('..')).toBeVisible({ timeout: 15_000 });
}

test.describe('Critical Journey 2 — CSV Import Pipeline & Accessible Transactions Ledger', () => {
  test('walks through CSV import wizard and verifies accessible Transactions filters', async ({
    page,
  }) => {
    await onboardQuickLocalVault(page);

    // Navigate to /import via SPA router (preserves unlocked RAM vault key)
    await navigateSpa(page, '/import');
    await expect(page.locator('h1')).toBeVisible();
    await expectAccessible(page);

    // Select first existing institute or create one if none exist
    const instituteButtons = page.locator('.max-w-3xl button');
    await instituteButtons.first().click();
    const instNameInput = page.locator('.max-w-3xl input[type="text"]').first();
    if (await instNameInput.isVisible()) {
      await instNameInput.fill('Interactive Brokers');
      await instNameInput.locator('..').locator('button').first().click();
    }

    // Create a new CTO account if none exist
    const createAccountToggle = page.locator('.max-w-3xl button svg.lucide-plus').locator('..').last();
    if (await createAccountToggle.isVisible()) {
      await createAccountToggle.click();
      const accountInput = page.locator('.max-w-3xl input[type="text"]').first();
      await accountInput.fill('Main CTO');
      await page.locator('#new-account-kind').selectOption('CTO');
      await page.locator('#new-account-currency').selectOption('EUR');
      await accountInput.locator('..').locator('button').first().click();
    }

    // Proceed to Step 2 (Upload)
    const continueStep1Btn = page.locator('button svg.lucide-arrow-right').locator('..');
    await expect(continueStep1Btn).toBeEnabled();
    await continueStep1Btn.click();

    // Upload CSV file via hidden input[type="file"]
    const csvContent = [
      'Date,Type,Symbol,Name,Quantity,Unit Price,Amount,Currency,Fee',
      '2025-02-10,Buy,AAPL,Apple Inc.,10,180.00,-1800.00,EUR,2.50',
      '2025-02-15,Buy,MSFT,Microsoft Corp.,5,400.00,-2000.00,EUR,2.50',
    ].join('\n');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e-trades.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    // Step 3 (Column Mapping) should appear with automatic TradeRepublic preset match
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 10_000 });
    await expectAccessible(page);

    // Click "Analyze Data" to advance to Step 4 (Staging Area)
    const analyzeBtn = page.locator('button svg.lucide-arrow-right').locator('..');
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // Step 4 (Staging Area) table should appear and allow finalizing the import
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 });
    await expectAccessible(page);

    // Navigate to /transactions via SPA router and verify all 6 accessible filter controls
    await navigateSpa(page, '/transactions');
    await expect(page.locator('#tx-filter-date-range')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#tx-filter-class')).toBeVisible();
    await expect(page.locator('#tx-filter-side')).toBeVisible();
    await expect(page.locator('#tx-filter-source')).toBeVisible();
    await expect(page.locator('#tx-filter-currency')).toBeVisible();
    await expect(page.locator('#tx-filter-status')).toBeVisible();

    // Verify every <select> has an associated <label for="...">
    for (const id of [
      'tx-filter-date-range',
      'tx-filter-class',
      'tx-filter-side',
      'tx-filter-source',
      'tx-filter-currency',
      'tx-filter-status',
    ]) {
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }

    // Filter interaction + accessible audit
    await page.locator('#tx-filter-side').selectOption('Buy');
    await page.locator('#tx-filter-date-range').selectOption('All');
    await expectAccessible(page);
  });
});

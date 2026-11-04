import { test, expect, expectAccessible } from './fixtures';

test.describe('Critical Journey 1 — Zero-Knowledge Vault Onboarding, Lock & Emergency Recovery', () => {
  test('initializes a local E2EE vault, locks it, rejects wrong password, and recovers via 256-bit recovery key', async ({
    page,
  }) => {
    await page.goto('/signup');

    // Fill local vault initialization form
    const nameInput = page.locator('#signup-name');
    const passwordInput = page.locator('#signup-password');
    await expect(nameInput).toBeVisible();
    await expectAccessible(page);

    await nameInput.fill('Alice Tester');
    await passwordInput.fill('Correct-Horse-Battery-Staple-99!');
    await page.locator('form button[type="submit"]').click();

    // Recovery Key Dialog must appear and display a formatted recovery key
    const recoveryKeyBox = page.locator('.font-mono.tracking-widest.break-all');
    await expect(recoveryKeyBox).toBeVisible({ timeout: 15_000 });
    const recoveryKey = (await recoveryKeyBox.innerText()).trim();
    expect(recoveryKey.replace(/-/g, '').length).toBeGreaterThanOrEqual(16);

    const last4 = recoveryKey.replace(/-/g, '').slice(-4).toUpperCase();

    // Confirm recovery key checkbox and 4-char challenge
    await page.locator('input[type="checkbox"]').check();
    await page.locator('#recovery-key-confirmation').fill(last4);

    const continueBtn = page.locator('#recovery-key-confirmation').locator('..').locator('..').locator('button').last();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Should navigate to Dashboard ("/") with unlocked header
    await expect(page).toHaveURL(/\/$/);
    const lockVaultBtn = page.locator('header button svg.lucide-lock').locator('..');
    await expect(lockVaultBtn).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);

    // Lock the vault via the header Lock button
    await lockVaultBtn.click();

    // LockScreen should now be visible
    const lockPasswordInput = page.locator('#vault-password');
    await expect(lockPasswordInput).toBeVisible();
    await expectAccessible(page);

    // Attempt unlock with wrong password -> must display error alert and stay locked
    await lockPasswordInput.fill('Wrong-Password-Attempt-123!');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(lockPasswordInput).toBeVisible();

    // Switch to Emergency Recovery Key mode and unlock
    const useRecoveryBtn = page.locator('button svg.lucide-key-round').locator('..');
    await useRecoveryBtn.click();

    const recoveryInput = page.locator('#vault-recovery-key');
    await expect(recoveryInput).toBeVisible();
    await recoveryInput.fill(recoveryKey);
    await page.locator('form button[type="submit"]').click();

    // Dashboard should unlock again
    await expect(lockVaultBtn).toBeVisible({ timeout: 15_000 });

    // Reload the page -> server-persisted vault header must remain intact and prompt for Master Password
    await page.reload();
    const reloadPasswordInput = page.locator('input[type="password"]').first();
    await expect(reloadPasswordInput).toBeVisible({ timeout: 15_000 });
    await reloadPasswordInput.fill('Correct-Horse-Battery-Staple-99!');
    await page.locator('form button[type="submit"]').click();
    await expect(lockVaultBtn).toBeVisible({ timeout: 15_000 });
  });
});

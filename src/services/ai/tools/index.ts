import { aiToolRegistry } from '../aiToolRegistry';
import { getPortfolioSummaryTool, getAssetAllocationTool } from './portfolioTools';
import { listPositionsTool } from './positionTools';
import { listInstrumentsTool, updateInstrumentTool } from './instrumentTools';
import { listTransactionsTool, recordTransactionTool } from './transactionTools';
import { getTaxSummaryTool, simulateTaxImpactTool } from './fiscalTools';
import { listGoalsTool, createGoalTool } from './goalTools';
import { 
  getGamificationStatusTool, 
  suggestNextMilestoneTool, 
  listQuestsTool,
  getProgressStatsTool
} from './gamificationTools';
import {
  getSecurityStatusTool,
  listAuthMethodsTool,
  listVaultSecretsTool,
  lockVaultTool,
  rotateEncryptionKeyTool,
  getEmailVerificationStatusTool,
  resendVerificationEmailTool,
  getStorageStatusTool,
} from './securityTools';
import { getPrivacyStatusTool, exportGdprArchiveTool } from './legalTools';
import {
  listNotificationsTool,
  manageNotificationsTool,
  listAlertRulesTool,
  createAlertRuleTool,
} from './notificationTools';
import {
  previewCsvImportTool,
  proposeCsvMappingTool,
  previewSnapshotImportTool,
  importSnapshotTool,
  previewTransactionImportTool,
  importTransactionsTool,
  getCostBasisMethodTool,
  setCostBasisMethodTool,
} from './importTools';
import { listConnectionsTool, syncConnectionTool, addWatchOnlyWalletTool, getBankSyncStatusTool } from './connectionTools';
import { listInstitutionsTool, renameAccountTool, setCashAccountKindTool } from './accountTools';
import {
  getCashflowSummaryTool,
  listCashflowTransactionsTool,
  listCashflowCategoriesTool,
  listCashflowRulesTool,
  listUpcomingOperationsTool,
  listRecurringExpensesTool,
  setRecurringStatusTool,
  getBudgetStatusTool,
  setBudgetTool,
  getCashflowForecastTool,
  getCashflowTaxItemsTool,
  updateCashflowOperationTool,
  setTransactionCategoryTool,
  createCashflowCategoryTool,
  createCategorizationRuleTool,
  recordCashOperationTool,
} from './cashflowTools';

/**
 * Initializes and registers all standard GlassFolio AI / MCP tools.
 * In line with AGENTS.md, any new business domain must register its tools here.
 */
export function registerAllStandardTools(): void {
  aiToolRegistry.registerTool(getPortfolioSummaryTool);
  aiToolRegistry.registerTool(getAssetAllocationTool);
  aiToolRegistry.registerTool(listPositionsTool);
  aiToolRegistry.registerTool(listInstrumentsTool);
  aiToolRegistry.registerTool(updateInstrumentTool);
  aiToolRegistry.registerTool(listTransactionsTool);
  aiToolRegistry.registerTool(recordTransactionTool);
  aiToolRegistry.registerTool(getTaxSummaryTool);
  aiToolRegistry.registerTool(simulateTaxImpactTool);
  aiToolRegistry.registerTool(listGoalsTool);
  aiToolRegistry.registerTool(createGoalTool);
  aiToolRegistry.registerTool(getGamificationStatusTool);
  aiToolRegistry.registerTool(suggestNextMilestoneTool);
  aiToolRegistry.registerTool(listQuestsTool);
  aiToolRegistry.registerTool(getProgressStatsTool);
  aiToolRegistry.registerTool(getSecurityStatusTool);
  aiToolRegistry.registerTool(listAuthMethodsTool);
  aiToolRegistry.registerTool(listVaultSecretsTool);
  aiToolRegistry.registerTool(lockVaultTool);
  aiToolRegistry.registerTool(rotateEncryptionKeyTool);
  aiToolRegistry.registerTool(getEmailVerificationStatusTool);
  aiToolRegistry.registerTool(resendVerificationEmailTool);
  aiToolRegistry.registerTool(getStorageStatusTool);
  aiToolRegistry.registerTool(listNotificationsTool);
  aiToolRegistry.registerTool(manageNotificationsTool);
  aiToolRegistry.registerTool(listAlertRulesTool);
  aiToolRegistry.registerTool(createAlertRuleTool);
  aiToolRegistry.registerTool(getPrivacyStatusTool);
  aiToolRegistry.registerTool(exportGdprArchiveTool);
  aiToolRegistry.registerTool(previewCsvImportTool);
  aiToolRegistry.registerTool(proposeCsvMappingTool);
  aiToolRegistry.registerTool(previewSnapshotImportTool);
  aiToolRegistry.registerTool(importSnapshotTool);
  aiToolRegistry.registerTool(previewTransactionImportTool);
  aiToolRegistry.registerTool(importTransactionsTool);
  aiToolRegistry.registerTool(getCostBasisMethodTool);
  aiToolRegistry.registerTool(setCostBasisMethodTool);
  aiToolRegistry.registerTool(listConnectionsTool);
  aiToolRegistry.registerTool(syncConnectionTool);
  aiToolRegistry.registerTool(addWatchOnlyWalletTool);
  aiToolRegistry.registerTool(getBankSyncStatusTool);
  aiToolRegistry.registerTool(listInstitutionsTool);
  aiToolRegistry.registerTool(renameAccountTool);
  aiToolRegistry.registerTool(setCashAccountKindTool);
  // Cash flow (Epic E52)
  aiToolRegistry.registerTool(getCashflowSummaryTool);
  aiToolRegistry.registerTool(listCashflowTransactionsTool);
  aiToolRegistry.registerTool(listCashflowCategoriesTool);
  aiToolRegistry.registerTool(listCashflowRulesTool);
  aiToolRegistry.registerTool(listUpcomingOperationsTool);
  aiToolRegistry.registerTool(listRecurringExpensesTool);
  aiToolRegistry.registerTool(setRecurringStatusTool);
  aiToolRegistry.registerTool(getBudgetStatusTool);
  aiToolRegistry.registerTool(setBudgetTool);
  aiToolRegistry.registerTool(getCashflowForecastTool);
  aiToolRegistry.registerTool(getCashflowTaxItemsTool);
  aiToolRegistry.registerTool(updateCashflowOperationTool);
  aiToolRegistry.registerTool(setTransactionCategoryTool);
  aiToolRegistry.registerTool(createCashflowCategoryTool);
  aiToolRegistry.registerTool(createCategorizationRuleTool);
  aiToolRegistry.registerTool(recordCashOperationTool);
}

// Auto-register on import
registerAllStandardTools();

export {
  getPortfolioSummaryTool,
  getAssetAllocationTool,
  listPositionsTool,
  listInstrumentsTool,
  updateInstrumentTool,
  listTransactionsTool,
  recordTransactionTool,
  getTaxSummaryTool,
  simulateTaxImpactTool,
  listGoalsTool,
  createGoalTool,
  getGamificationStatusTool,
  suggestNextMilestoneTool,
  listQuestsTool,
  getProgressStatsTool,
  getSecurityStatusTool,
  listAuthMethodsTool,
  listVaultSecretsTool,
  lockVaultTool,
  rotateEncryptionKeyTool,
  getEmailVerificationStatusTool,
  resendVerificationEmailTool,
  getStorageStatusTool,
  listNotificationsTool,
  manageNotificationsTool,
  listAlertRulesTool,
  createAlertRuleTool,
  getPrivacyStatusTool,
  exportGdprArchiveTool,
  previewCsvImportTool,
  proposeCsvMappingTool,
  previewSnapshotImportTool,
  importSnapshotTool,
  previewTransactionImportTool,
  importTransactionsTool,
  getCostBasisMethodTool,
  setCostBasisMethodTool,
  listConnectionsTool,
  syncConnectionTool,
  addWatchOnlyWalletTool,
  getBankSyncStatusTool,
  getCashflowSummaryTool,
  listCashflowTransactionsTool,
  listCashflowCategoriesTool,
  listCashflowRulesTool,
  listUpcomingOperationsTool,
  listRecurringExpensesTool,
  setRecurringStatusTool,
  getBudgetStatusTool,
  setBudgetTool,
  getCashflowForecastTool,
  getCashflowTaxItemsTool,
  updateCashflowOperationTool,
  setTransactionCategoryTool,
  createCashflowCategoryTool,
  createCategorizationRuleTool,
  recordCashOperationTool,
};

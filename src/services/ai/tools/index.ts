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
  listQuestsTool 
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
  getCostBasisMethodTool,
  setCostBasisMethodTool,
} from './importTools';

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
  aiToolRegistry.registerTool(getCostBasisMethodTool);
  aiToolRegistry.registerTool(setCostBasisMethodTool);
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
  getCostBasisMethodTool,
  setCostBasisMethodTool,
};

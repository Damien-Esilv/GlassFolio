import { aiToolRegistry } from '../aiToolRegistry';
import { getPortfolioSummaryTool, getAssetAllocationTool } from './portfolioTools';
import { listPositionsTool } from './positionTools';
import { listTransactionsTool, recordTransactionTool } from './transactionTools';
import { getTaxSummaryTool, simulateTaxImpactTool } from './fiscalTools';
import { listGoalsTool, createGoalTool } from './goalTools';
import { 
  getGamificationStatusTool, 
  suggestNextMilestoneTool, 
  listQuestsTool 
} from './gamificationTools';

/**
 * Initializes and registers all standard GlassFolio AI / MCP tools.
 * In line with AGENTS.md, any new business domain must register its tools here.
 */
export function registerAllStandardTools(): void {
  aiToolRegistry.registerTool(getPortfolioSummaryTool);
  aiToolRegistry.registerTool(getAssetAllocationTool);
  aiToolRegistry.registerTool(listPositionsTool);
  aiToolRegistry.registerTool(listTransactionsTool);
  aiToolRegistry.registerTool(recordTransactionTool);
  aiToolRegistry.registerTool(getTaxSummaryTool);
  aiToolRegistry.registerTool(simulateTaxImpactTool);
  aiToolRegistry.registerTool(listGoalsTool);
  aiToolRegistry.registerTool(createGoalTool);
  aiToolRegistry.registerTool(getGamificationStatusTool);
  aiToolRegistry.registerTool(suggestNextMilestoneTool);
  aiToolRegistry.registerTool(listQuestsTool);
}

// Auto-register on import
registerAllStandardTools();

export {
  getPortfolioSummaryTool,
  getAssetAllocationTool,
  listPositionsTool,
  listTransactionsTool,
  recordTransactionTool,
  getTaxSummaryTool,
  simulateTaxImpactTool,
  listGoalsTool,
  createGoalTool,
  getGamificationStatusTool,
  suggestNextMilestoneTool,
  listQuestsTool,
};

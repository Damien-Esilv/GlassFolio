import { AIToolDefinition } from '../types';
import { goalService } from '../../goalService';
import { FinancialGoal } from '../../../types/domain';

export const listGoalsTool: AIToolDefinition<
  Record<string, never>,
  Array<{
    id: string;
    title: string;
    targetAmount: number;
    currentAmount: number;
    progressPercentage: number;
    isPinned: boolean;
  }>
> = {
  name: 'list_goals',
  description: 'List user financial goals, target amounts, current amounts, and completion percentages.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const goals = await goalService.getGoals('EUR');

    return goals.map((g) => {
      const current = g.currentAmount || 0;
      const target = g.targetAmount || 1;
      const pct = Math.min(100, Math.round((current / target) * 10000) / 100);

      return {
        id: g.id,
        title: g.title,
        targetAmount: g.targetAmount,
        currentAmount: current,
        progressPercentage: pct,
        isPinned: g.isPinned,
      };
    });
  },
};

export const createGoalTool: AIToolDefinition<
  { title: string; targetAmount: number; deadline?: string },
  { success: boolean; goalId: string; message: string }
> = {
  name: 'create_goal',
  description:
    'Create a new financial goal with a target amount. Requires explicit human confirmation before execution.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the goal, e.g. Emergency Fund, Apartment Deposit',
      },
      targetAmount: {
        type: 'number',
        description: 'Target amount to achieve in EUR',
      },
      deadline: {
        type: 'string',
        description: 'Target deadline date in YYYY-MM-DD format',
      },
    },
    required: ['title', 'targetAmount'],
  },
  execute: async (params) => {
    const newGoal: Omit<FinancialGoal, 'id'> = {
      title: params.title,
      targetAmount: params.targetAmount,
      isPinned: false,
      iconType: 'other',
      color: 'blue',
      method: 'manual',
      manualAmount: 0,
    };

    const saved = await goalService.saveGoal(newGoal as FinancialGoal, 'EUR');
    const created = saved[saved.length - 1];

    return {
      success: true,
      goalId: created?.id || `goal-${Date.now()}`,
      message: `Goal '${params.title}' of ${params.targetAmount}€ successfully created.`,
    };
  },
};

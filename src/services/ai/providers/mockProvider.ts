import i18n from '../../../i18n';
import { AIProvider } from './types';
import { AILanguage, ChatMessage, LLMResponse, ToolCallRequest } from '../types';

const THINKING_STEPS = ['step1', 'step2', 'step3'] as const;
const EXAMPLE_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

/**
 * MockProvider - Intelligent offline rule-based financial assistant.
 * Allows instant, zero-config testing and offline demos without requiring an external API key.
 * Every sentence comes from the `ai:mock` translations, in the language of the interface.
 */
export class MockProvider implements AIProvider {
  constructor(private enableThinking: boolean = true) {}

  public async sendMessage(
    messages: ChatMessage[],
    _tools: unknown[],
    _systemPrompt: string,
    language: AILanguage = 'fr'
  ): Promise<LLMResponse> {
    // Artificial slight latency to match realistic conversational feel
    await new Promise((res) => setTimeout(res, 250));

    const t = (key: string, options: Record<string, unknown> = {}): string =>
      i18n.t(key, { lng: language, ...options });
    const thinking = (group: 'toolResult' | 'transaction' | 'goal' | 'default', options: Record<string, unknown> = {}): string =>
      this.enableThinking
        ? `<think>\n${THINKING_STEPS.map((step, index) => `${index + 1}. ${t(`ai:mock.thinking.${group}.${step}`, options)}`).join('\n')}\n</think>\n\n`
        : '';

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return { content: t('ai:mock.greeting') };
    }

    // 1. If previous step was a tool execution response, synthesize the answer
    if (lastMessage.role === 'tool') {
      const res = this.synthesizeToolResult(lastMessage, t, language);
      if (this.enableThinking && !res.content.startsWith('<think>')) {
        return { ...res, content: `${thinking('toolResult', { tool: lastMessage.toolName })}${res.content}` };
      }
      return res;
    }

    // 2. Analyze user intent to trigger relevant tools (French and English keywords)
    const text = lastMessage.content.toLowerCase();

    // Check for transaction recording request
    if (
      (text.includes('enregistre') || text.includes('ajoute') || text.includes('achète') || text.includes('record') || text.includes('buy')) &&
      (text.includes('action') || text.includes('share') || text.includes('aapl') || text.includes('apple') || text.includes('btc') || text.includes('eth'))
    ) {
      const isApple = text.includes('aapl') || text.includes('apple');
      const symbol = isApple ? 'AAPL' : 'BTC';
      const instrument = isApple ? 'Apple Inc.' : 'Bitcoin';
      const amount = isApple ? 10 : 0.05;
      const price = isApple ? 175 : 65000;

      const toolCall: ToolCallRequest = {
        id: `call_${Date.now()}`,
        name: 'record_transaction',
        arguments: {
          instrument,
          symbol,
          type: 'Buy',
          amount,
          price,
          currency: 'EUR',
          date: new Date().toISOString().split('T')[0],
          fees: 2.5,
        },
      };

      return {
        content: `${thinking('transaction', { amount, symbol, instrument, price })}${t('ai:mock.transactionProposal', { instrument, symbol })}`,
        toolCalls: [toolCall],
      };
    }

    // Check for goal creation request
    if (
      (text.includes('crée') || text.includes('nouvel') || text.includes('create') || text.includes('new')) &&
      (text.includes('objectif') || text.includes('goal'))
    ) {
      const toolCall: ToolCallRequest = {
        id: `call_${Date.now()}`,
        name: 'create_goal',
        arguments: {
          title: t('ai:mock.goalTitle'),
          targetAmount: 10000,
          deadline: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0],
        },
      };

      return {
        content: `${thinking('goal')}${t('ai:mock.goalProposal')}`,
        toolCalls: [toolCall],
      };
    }

    // Check for portfolio summary
    if (
      text.includes('résumé') ||
      text.includes('bilan') ||
      text.includes('patrimoine') ||
      text.includes('summary') ||
      text.includes('wealth') ||
      text.includes('net worth') ||
      text.includes('gains') ||
      text.includes('valeur')
    ) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'get_portfolio_summary', arguments: { currency: 'EUR' } }],
      };
    }

    // Check for asset allocation
    if (
      text.includes('allocation') ||
      text.includes('répartition') ||
      text.includes('classe') ||
      text.includes('breakdown') ||
      text.includes('pie') ||
      text.includes('camembert')
    ) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'get_asset_allocation', arguments: { currency: 'EUR' } }],
      };
    }

    // Check for positions / holdings
    if (
      text.includes('position') ||
      text.includes('ligne') ||
      text.includes('holding') ||
      text.includes('titre') ||
      text.includes('pru') ||
      text.includes('cost basis')
    ) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'list_positions', arguments: {} }],
      };
    }

    // Check for recent transactions
    if (
      text.includes('transaction') ||
      text.includes('historique') ||
      text.includes('history') ||
      text.includes('ordre') ||
      text.includes('achat') ||
      text.includes('vente')
    ) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'list_transactions', arguments: { limit: 5 } }],
      };
    }

    // Check for tax / fiscalite
    if (text.includes('impôt') || text.includes('fisc') || text.includes('tax') || text.includes('plus-value') || text.includes('capital gain') || text.includes('pfu')) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'get_tax_summary', arguments: {} }],
      };
    }

    // Check for goals
    if (text.includes('objectif') || text.includes('goal')) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'list_goals', arguments: {} }],
      };
    }

    // Default conversational response
    return {
      content:
        `${thinking('default')}${t('ai:mock.intro')}\n\n` +
        `**${t('ai:mock.examplesTitle')}**\n` +
        EXAMPLE_KEYS.map((key) => `- *"${t(`ai:mock.examples.${key}`)}"*`).join('\n'),
    };
  }

  private synthesizeToolResult(
    toolMsg: ChatMessage,
    t: (key: string, options?: Record<string, unknown>) => string,
    language: AILanguage
  ): LLMResponse {
    const locale = language === 'en' ? 'en-US' : 'fr-FR';
    const num = (value: number | undefined): string => (value ?? 0).toLocaleString(locale);

    try {
      const data = JSON.parse(toolMsg.content);

      if (toolMsg.toolName === 'get_portfolio_summary') {
        const sign = data.totalPL >= 0 ? '+' : '';
        return {
          content:
            `### ${t('ai:mock.summary.title')}\n\n` +
            `- **${t('ai:mock.summary.netWorth')}:** **${num(data.totalValue)} ${data.currency}**\n` +
            `- **${t('ai:mock.summary.invested')}:** ${num(data.totalInvested)} ${data.currency}\n` +
            `- **${t('ai:mock.summary.unrealized')}:** **${sign}${num(data.totalPL)} ${data.currency}** (${sign}${data.totalPLPercent}%)\n` +
            `- **${t('ai:mock.summary.positions')}:** ${data.positionsCount}\n\n` +
            t('ai:mock.summary.followUp'),
        };
      }

      if (toolMsg.toolName === 'get_asset_allocation') {
        const list = Array.isArray(data) ? data : [];
        const rows = list
          .map((item: { assetClass: string; value: number; percentage: number }) =>
            `- **${item.assetClass}**: ${num(item.value)} € (${item.percentage}%)`
          )
          .join('\n');

        return {
          content: `### ${t('ai:mock.allocation.title')}\n\n${rows}\n\n*${t('ai:mock.allocation.tip')}*`,
        };
      }

      if (toolMsg.toolName === 'list_positions') {
        const positions = Array.isArray(data) ? data : [];
        const rows = positions
          .slice(0, 5)
          .map((p: { symbol: string; quantity: number; lastPrice: number; marketValue: number; unrealizedPL: number }) => {
            const sign = p.unrealizedPL >= 0 ? '+' : '';
            return `| **${p.symbol}** | ${p.quantity} | ${p.lastPrice}€ | **${num(p.marketValue)}€** | ${sign}${p.unrealizedPL}€ |`;
          })
          .join('\n');

        return {
          content:
            `### ${t('ai:mock.positions.title')}\n\n` +
            `| ${t('ai:mock.positions.asset')} | ${t('ai:mock.positions.quantity')} | ${t('ai:mock.positions.price')} | ${t('ai:mock.positions.value')} | ${t('ai:mock.positions.pl')} |\n` +
            `| :--- | :--- | :--- | :--- | :--- |\n` +
            rows +
            `\n\n*${t('ai:mock.positions.count', { count: positions.length })}*`,
        };
      }

      if (toolMsg.toolName === 'get_tax_summary') {
        return {
          content:
            `### ${t('ai:mock.tax.title', { year: data.fiscalYear })}\n\n` +
            `- **${t('ai:mock.tax.grossGains')}:** +${num(data.totalGrossCapitalGains)} €\n` +
            `- **${t('ai:mock.tax.carriedLosses')}:** -${num(data.totalGrossCapitalLosses)} €\n` +
            `- **${t('ai:mock.tax.netTaxable')}:** **${num(data.netTaxableGain)} €**\n` +
            `- **${t('ai:mock.tax.estimatedTax')}:** ${num(data.totalTaxDue)} €\n` +
            `- **${t('ai:mock.tax.regime')}:** **${data.recommendedRegime || t('ai:mock.tax.defaultRegime')}**\n\n` +
            `*(${t('ai:mock.tax.savings', { amount: num(data.taxSavingsWithOptimalRegime) })})*`,
        };
      }

      if (toolMsg.toolName === 'list_goals') {
        const goals = Array.isArray(data) ? data : [];
        const rows = goals
          .map((g: { title: string; currentAmount: number; targetAmount: number; progressPercentage: number }) =>
            `- **${g.title}**: ${num(g.currentAmount)}€ / ${num(g.targetAmount)}€ (**${g.progressPercentage}%**)`
          )
          .join('\n');

        return {
          content: `### ${t('ai:mock.goals.title')}\n\n${rows || t('ai:mock.goals.empty')}`,
        };
      }

      if (toolMsg.toolName === 'list_transactions') {
        const txs = Array.isArray(data) ? data : [];
        const rows = txs
          .map((tx: { date: string; type: string; symbol: string; amount: number; total: number }) =>
            `- *${tx.date}* — **${tx.type}** ${tx.amount} ${tx.symbol} (Total: ${num(tx.total)}€)`
          )
          .join('\n');

        return {
          content: `### ${t('ai:mock.transactions.title')}\n\n${rows || t('ai:mock.transactions.empty')}`,
        };
      }

      return {
        content: `${t('ai:mock.rawData')}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      };
    } catch {
      return { content: t('ai:mock.rawResult', { tool: toolMsg.toolName, content: toolMsg.content }) };
    }
  }
}

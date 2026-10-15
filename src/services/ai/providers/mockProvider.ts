import { AIProvider } from './types';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

/**
 * MockProvider - Intelligent offline rule-based financial assistant.
 * Allows instant, zero-config testing and offline demos without requiring an external API key.
 */
export class MockProvider implements AIProvider {
  constructor(private enableThinking: boolean = true) {}

  public async sendMessage(
    messages: ChatMessage[],
    _tools: unknown[],
    _systemPrompt: string
  ): Promise<LLMResponse> {
    // Artificial slight latency to match realistic conversational feel
    await new Promise((res) => setTimeout(res, 250));

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return { content: 'Bonjour ! Comment puis-je vous aider avec votre patrimoine aujourd’hui ?' };
    }

    // 1. If previous step was a tool execution response, synthesize the answer
    if (lastMessage.role === 'tool') {
      const res = this.synthesizeToolResult(lastMessage);
      if (this.enableThinking && !res.content.startsWith('<think>')) {
        const thought =
          `<think>\n` +
          `1. Analyse des données brutes renvoyées par l'outil "${lastMessage.toolName}".\n` +
          `2. Calcul des ratios et agrégations financières pour la synthèse.\n` +
          `3. Formatage de la réponse en Markdown avec métriques clés.\n` +
          `</think>\n\n`;
        return { ...res, content: `${thought}${res.content}` };
      }
      return res;
    }

    // 2. Analyze user intent to trigger relevant tools
    const text = lastMessage.content.toLowerCase();

    // Check for transaction recording request
    if (
      (text.includes('enregistre') || text.includes('ajoute') || text.includes('achète') || text.includes('record') || text.includes('buy')) &&
      (text.includes('action') || text.includes('aapl') || text.includes('apple') || text.includes('btc') || text.includes('eth'))
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
        content: `J'ai préparé l'ordre d'achat pour **${instrument} (${symbol})**. S'agissant d'une modification financière de votre portefeuille, veuillez valider l'opération ci-dessous :`,
        toolCalls: [toolCall],
      };
    }

    // Check for goal creation request
    if (
      (text.includes('crée') || text.includes('nouvel') || text.includes('create')) &&
      (text.includes('objectif') || text.includes('goal'))
    ) {
      const toolCall: ToolCallRequest = {
        id: `call_${Date.now()}`,
        name: 'create_goal',
        arguments: {
          title: 'Fonds d’urgence',
          targetAmount: 10000,
          deadline: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0],
        },
      };

      return {
        content: `Je vous propose de créer un nouvel objectif financier. Veuillez confirmer ci-dessous pour l'enregistrer dans GlassFolio :`,
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
      text.includes('pru')
    ) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'list_positions', arguments: {} }],
      };
    }

    // Check for recent transactions
    if (text.includes('transaction') || text.includes('historique') || text.includes('ordre') || text.includes('achat') || text.includes('vente')) {
      return {
        content: '',
        toolCalls: [{ id: `call_${Date.now()}`, name: 'list_transactions', arguments: { limit: 5 } }],
      };
    }

    // Check for tax / fiscalite
    if (text.includes('impôt') || text.includes('fisc') || text.includes('tax') || text.includes('plus-value') || text.includes('pfu')) {
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
        `Je suis votre assistant financier privé GlassFolio. Je peux analyser votre portefeuille, vérifier vos allocations d'actifs, calculer vos plus-values imposables ou vous aider à enregistrer des transactions en toute sécurité.\n\n` +
        `**Quelques exemples de questions :**\n` +
        `- *"Fais le bilan de mon patrimoine net et de mes gains."*\n` +
        `- *"Quelle est mon allocation d'actifs ?"*\n` +
        `- *"Quelles sont mes positions avec leur PRU ?"*\n` +
        `- *"Analyse mes plus-values imposables."*\n` +
        `- *"Enregistre un achat de 10 actions Apple."*`,
    };
  }

  private synthesizeToolResult(toolMsg: ChatMessage): LLMResponse {
    try {
      const data = JSON.parse(toolMsg.content);

      if (toolMsg.toolName === 'get_portfolio_summary') {
        const sign = data.totalPL >= 0 ? '+' : '';
        return {
          content:
            `### 📊 Synthèse de votre Portefeuille\n\n` +
            `- **Patrimoine Net Total :** **${data.totalValue?.toLocaleString('fr-FR')} ${data.currency}**\n` +
            `- **Montant Investi :** ${data.totalInvested?.toLocaleString('fr-FR')} ${data.currency}\n` +
            `- **Plus-Value Latente :** **${sign}${data.totalPL?.toLocaleString('fr-FR')} ${data.currency}** (${sign}${data.totalPLPercent}%)\n` +
            `- **Nombre de positions actives :** ${data.positionsCount}\n\n` +
            `Votre portefeuille est bien diversifié. Souhaitez-vous une analyse détaillée de l'allocation d'actifs ou un point sur la fiscalité ?`,
        };
      }

      if (toolMsg.toolName === 'get_asset_allocation') {
        const list = Array.isArray(data) ? data : [];
        const rows = list
          .map((item: { assetClass: string; value: number; percentage: number }) =>
            `- **${item.assetClass}** : ${item.value.toLocaleString('fr-FR')} € (${item.percentage}%)`
          )
          .join('\n');

        return {
          content:
            `### 🥧 Répartition de vos Actifs\n\n` +
            rows +
            `\n\n*Conseil : Conserver un équilibre entre liquidités et actifs productifs permet de réduire la volatilité globale.*`,
        };
      }

      if (toolMsg.toolName === 'list_positions') {
        const positions = Array.isArray(data) ? data : [];
        const rows = positions
          .slice(0, 5)
          .map((p: { symbol: string; quantity: number; lastPrice: number; marketValue: number; unrealizedPL: number }) => {
            const sign = p.unrealizedPL >= 0 ? '+' : '';
            return `| **${p.symbol}** | ${p.quantity} | ${p.lastPrice}€ | **${p.marketValue.toLocaleString('fr-FR')}€** | ${sign}${p.unrealizedPL}€ |`;
          })
          .join('\n');

        return {
          content:
            `### 💼 Vos Principales Positions\n\n` +
            `| Actif | Quantité | Cours | Valorisation | PnL Latent |\n` +
            `| :--- | :--- | :--- | :--- | :--- |\n` +
            rows +
            `\n\n*${positions.length} position(s) détenue(s) au total.*`,
        };
      }

      if (toolMsg.toolName === 'get_tax_summary') {
        return {
          content:
            `### 💡 Bilan Fiscal (Année ${data.fiscalYear})\n\n` +
            `- **Plus-values brutes :** +${data.totalGrossCapitalGains?.toLocaleString('fr-FR')} €\n` +
            `- **Moins-values reportables :** -${data.totalGrossCapitalLosses?.toLocaleString('fr-FR')} €\n` +
            `- **Plus-value nette imposable :** **${data.netTaxableGain?.toLocaleString('fr-FR')} €**\n` +
            `- **Estimation d'impôt (PFU) :** ${data.totalTaxDue?.toLocaleString('fr-FR')} €\n` +
            `- **Régime recommandé :** **${data.recommendedRegime || 'PFU (Flat-tax 30%)'}**\n\n` +
            `*(Économie potentielle : ${data.taxSavingsWithOptimalRegime || 0} €)*`,
        };
      }

      if (toolMsg.toolName === 'list_goals') {
        const goals = Array.isArray(data) ? data : [];
        const rows = goals
          .map((g: { title: string; currentAmount: number; targetAmount: number; progressPercentage: number }) =>
            `- **${g.title}** : ${g.currentAmount.toLocaleString('fr-FR')}€ / ${g.targetAmount.toLocaleString('fr-FR')}€ (**${g.progressPercentage}%**)`
          )
          .join('\n');

        return {
          content: `### 🎯 Avancement de vos Objectifs\n\n` + (rows || 'Aucun objectif actif pour le moment.'),
        };
      }

      if (toolMsg.toolName === 'list_transactions') {
        const txs = Array.isArray(data) ? data : [];
        const rows = txs
          .map((t: { date: string; type: string; symbol: string; amount: number; total: number }) =>
            `- *${t.date}* — **${t.type}** ${t.amount} ${t.symbol} (Total: ${t.total?.toLocaleString('fr-FR')}€)`
          )
          .join('\n');

        return {
          content: `### 📝 Dernières Transactions\n\n` + (rows || 'Aucune transaction récente.'),
        };
      }

      return {
        content: `Données obtenues avec succès :\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      };
    } catch {
      return { content: `Résultat reçu de l'outil ${toolMsg.toolName} : ${toolMsg.content}` };
    }
  }
}

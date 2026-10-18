import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Unlock, ShieldAlert, Cpu, Terminal, KeyRound, Fingerprint, CheckCircle2 } from 'lucide-react';

type VaultState = 'unlocked' | 'locked';
type AiProvider = 'ollama' | 'claude' | 'cursor' | 'byok';

interface ToolPreview {
  tool: string;
  isMutation: boolean;
  sampleCall: string;
}

const TOOL_PREVIEWS: Record<AiProvider, ToolPreview[]> = {
  ollama: [
    {
      tool: 'get_portfolio_summary',
      isMutation: false,
      sampleCall: 'tools.call("get_portfolio_summary", { baseCurrency: "EUR" })',
    },
    {
      tool: 'simulate_tax_impact',
      isMutation: false,
      sampleCall: 'tools.call("simulate_tax_impact", { amount: 3500, type: "dividends", tmi: 0.11 })',
    },
  ],
  claude: [
    {
      tool: 'get_portfolio_summary',
      isMutation: false,
      sampleCall: 'mcp.call("get_portfolio_summary", {})',
    },
    {
      tool: 'record_transaction',
      isMutation: true,
      sampleCall: 'mcp.call("record_transaction", { symbol: "CW8", quantity: 10, price: 495.20 })',
    },
  ],
  cursor: [
    {
      tool: 'get_asset_allocation',
      isMutation: false,
      sampleCall: 'cursor.tools.invoke("get_asset_allocation", { groupBy: "envelope" })',
    },
    {
      tool: 'create_goal',
      isMutation: true,
      sampleCall: 'cursor.tools.invoke("create_goal", { name: "Apport RP", targetAmount: 50000 })',
    },
  ],
  byok: [
    {
      tool: 'get_security_status',
      isMutation: false,
      sampleCall: 'aiToolRegistry.execute("get_security_status", {})',
    },
    {
      tool: 'lock_vault',
      isMutation: true,
      sampleCall: 'aiToolRegistry.execute("lock_vault", {})',
    },
  ],
};

export const InteractiveSecurityMcpPreview: React.FC = () => {
  const { t } = useTranslation();
  const [vaultState, setVaultState] = useState<VaultState>('unlocked');
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>('ollama');

  const tools = TOOL_PREVIEWS[selectedProvider];

  return (
    <section id="security-ai" className="py-16 lg:py-24 border-t border-subtle bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <Lock size={14} />
            <span>{t('landing:securityAi.sectionBadge')}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-4">
            {t('landing:securityAi.title')}
          </h2>

          <p className="text-sm sm:text-base text-secondary leading-relaxed">
            {t('landing:securityAi.subtitle')}
          </p>
        </div>

        {/* 2-Column Playground: Vault State (Sub A) & AI/MCP (Sub B) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Sub-Widget A: Vault State Toggle */}
          <div className="bg-card border border-subtle rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert size={18} className="text-brand" />
                <h3 className="text-sm font-bold text-primary">
                  {t('landing:securityAi.vaultTitle')}
                </h3>
              </div>

              {/* Toggle Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6" role="group">
                <button
                  type="button"
                  onClick={() => setVaultState('unlocked')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all ${
                    vaultState === 'unlocked'
                      ? 'bg-positive-subtle border-2 border-positive text-positive shadow-sm'
                      : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                  }`}
                >
                  <Unlock size={14} />
                  <span>{t('landing:securityAi.btnUnlocked')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVaultState('locked')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all ${
                    vaultState === 'locked'
                      ? 'bg-brand/15 border-2 border-brand text-brand shadow-sm'
                      : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                  }`}
                >
                  <Lock size={14} />
                  <span>{t('landing:securityAi.btnLocked')}</span>
                </button>
              </div>

              {/* Data Representation Card */}
              <div className="p-4 rounded-xl bg-subtle/60 border border-subtle font-mono text-xs mb-5">
                <p className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-2 font-sans">
                  {t('landing:securityAi.vaultStateLabel')}:{' '}
                  <span className={vaultState === 'unlocked' ? 'text-positive' : 'text-brand'}>
                    {vaultState.toUpperCase()}
                  </span>
                </p>

                {vaultState === 'unlocked' ? (
                  <div className="space-y-1.5 text-primary">
                    <p className="flex justify-between">
                      <span className="text-secondary font-sans">Total Net Worth:</span>
                      <span className="font-bold text-positive">148 450,00 €</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-secondary font-sans">Enveloppe PEA (BoursoBank):</span>
                      <span>68 200,00 € (CW8: 125 parts)</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-secondary font-sans">Enveloppe CTO (Trade Republic):</span>
                      <span>54 100,00 € (NVDA, AAPL)</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-secondary font-sans">WebCrypto DEK in RAM:</span>
                      <span className="text-brand">Extractable: false (CryptoKey)</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-secondary overflow-x-auto text-[11px]">
                    <p className="text-brand font-bold">
                      &#47;&#47; AES-256-GCM Encrypted Storage Envelope:
                    </p>
                    <p>
                      <span className="text-secondary">iv:</span>{' '}
                      <span className="text-primary font-bold">&quot;9zK2m8xV1qP3&quot;</span>{' '}
                      <span className="text-tertiary">(96-bit random nonce)</span>
                    </p>
                    <p>
                      <span className="text-secondary">aad:</span>{' '}
                      <span className="text-primary font-bold">&quot;glassfolio_portfolio&quot;</span>{' '}
                      <span className="text-tertiary">(AAD binding)</span>
                    </p>
                    <p className="truncate">
                      <span className="text-secondary">ciphertext:</span>{' '}
                      <span className="text-primary font-bold">
                        &quot;0a8f7c19b2e4...e72d91a&quot;
                      </span>{' '}
                      <span className="text-tertiary">(256-bit GCM tag verified)</span>
                    </p>
                  </div>
                )}
              </div>

              {/* KDF Pipeline Spec */}
              <p className="text-[11px] text-tertiary font-mono mb-4">
                {t('landing:securityAi.kdfPipeline')}
              </p>
            </div>

            {/* Protections Badges */}
            <div className="pt-4 border-t border-subtle flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subtle text-secondary border border-subtle">
                <KeyRound size={13} className="text-brand" />
                <span>{t('landing:securityAi.protections.totp')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subtle text-secondary border border-subtle">
                <Fingerprint size={13} className="text-brand" />
                <span>{t('landing:securityAi.protections.passkeys')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subtle text-secondary border border-subtle">
                <CheckCircle2 size={13} className="text-positive" />
                <span>{t('landing:securityAi.protections.recovery')}</span>
              </span>
            </div>
          </div>

          {/* Sub-Widget B: Guarded AI & MCP Runtime Selector */}
          <div className="bg-card border border-subtle rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={18} className="text-brand" />
                <h3 className="text-sm font-bold text-primary">
                  {t('landing:securityAi.aiTitle')}
                </h3>
              </div>

              {/* Provider Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-5" role="group">
                {(['ollama', 'claude', 'cursor', 'byok'] as const).map((prov) => {
                  const isSelected = selectedProvider === prov;
                  return (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setSelectedProvider(prov)}
                      className={`p-2.5 rounded-xl text-xs font-semibold text-center truncate transition-all ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                      }`}
                    >
                      {t(`landing:securityAi.providers.${prov}`)}
                    </button>
                  );
                })}
              </div>

              {/* Guardrails Human-in-the-Loop Callout */}
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium flex items-center gap-2.5 mb-5">
                <CheckCircle2 size={16} className="text-brand shrink-0" />
                <span>{t('landing:securityAi.guardrailBadge')}</span>
              </div>

              {/* Registered Tools Live Preview */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2.5">
                  <Terminal size={14} className="text-brand" />
                  <span>{t('landing:securityAi.toolPreviewTitle')}</span>
                </div>

                <div className="space-y-2.5">
                  {tools.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-subtle/50 border border-subtle flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-primary">{item.tool}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            item.isMutation
                              ? 'bg-warning-subtle text-warning border-warning/30'
                              : 'bg-positive-subtle text-positive border-positive/30'
                          }`}
                        >
                          {item.isMutation
                            ? t('landing:securityAi.confirmationTag')
                            : t('landing:securityAi.readOnlyTag')}
                        </span>
                      </div>
                      <code className="text-[11px] font-mono text-brand truncate">
                        {item.sampleCall}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-5 pt-3 border-t border-subtle text-[11px] text-tertiary">
              16 MCP tools registered in <span className="font-mono font-bold text-secondary">aiToolRegistry</span> &bull; Stdio transport for external agents.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

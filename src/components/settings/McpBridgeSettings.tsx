import React, { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Cpu, Eye, EyeOff, Sparkles, TriangleAlert } from 'lucide-react';
import { MCP_SETUP_PROMPT } from '../../config/mcpSetupPrompt';
import { MCP_SERVE_COMMANDS } from '../../config/mcpClients';
import { aiSettingsService } from '../../services/ai/aiSettingsService';
import {
  STANDALONE_BRIDGE_URL,
  getMcpBridgeSettings,
  normalizeBridgeUrl,
  resolveBridgeBaseUrl,
  saveMcpBridgeSettings,
  subscribeMcpBridgeSettings,
} from '../../services/mcpBridge/mcpBridgeSettings';
import { getMcpBridgeStatus, subscribeMcpBridgeStatus, type McpBridgeStatus } from '../../services/mcpBridge/mcpBridgeStatus';
import { CopyBlock } from '../mcp/CopyBlock';
import { McpClientPicker } from '../mcp/McpClientPicker';
import { McpCommandList } from '../mcp/McpCommandList';

const STATUS_STYLE: Record<McpBridgeStatus, string> = {
  off: 'bg-subtle text-secondary border-subtle',
  locked: 'bg-subtle text-secondary border-subtle',
  needsToken: 'bg-warning/15 text-warning border-warning/30',
  connecting: 'bg-subtle text-secondary border-subtle',
  connected: 'bg-success/15 text-success border-success/30',
  unauthorized: 'bg-warning/15 text-warning border-warning/30',
  unreachable: 'bg-warning/15 text-warning border-warning/30',
  replaced: 'bg-warning/15 text-warning border-warning/30',
};

const fieldClass = 'w-full bg-subtle text-primary border border-subtle rounded-lg px-3 py-2 text-xs font-mono focus:ring-primary focus:border-primary';

const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }}
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-xs font-semibold text-primary transition-colors"
    >
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      <span>{copied ? t('ai:mcpBridge.copied') : t('ai:mcpBridge.copy')}</span>
    </button>
  );
};

/** Settings > AI & MCP: lets AI clients call GlassFolio's tools through a bridge on this computer. */
export const McpBridgeSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useSyncExternalStore(subscribeMcpBridgeSettings, getMcpBridgeSettings);
  const status = useSyncExternalStore(subscribeMcpBridgeStatus, getMcpBridgeStatus);
  const [revealed, setRevealed] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [addressDraft, setAddressDraft] = useState(settings.url);
  const [addressInvalid, setAddressInvalid] = useState(false);

  const baseUrl = resolveBridgeBaseUrl(settings);
  const ownServer = baseUrl === '';
  const origin = ownServer ? window.location.origin : baseUrl;
  const endpoint = `${origin}/mcp`;
  const token = settings.token || '<token>';
  const autonomous = aiSettingsService.getSettings().executionMode === 'autonomous';
  // The token stays hidden on screen until revealed; every copy button copies the real text
  const mask = (text: string): string => (revealed || !settings.token ? text : text.split(settings.token).join('••••••••'));

  const saveAddress = (value: string): void => {
    setAddressDraft(value);
    const normalized = normalizeBridgeUrl(value);
    setAddressInvalid(normalized === null);
    if (normalized !== null) saveMcpBridgeSettings({ url: normalized });
  };

  return (
    <div className="p-6 rounded-2xl bg-card border border-subtle space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-primary">{t('ai:settings.mcp.title')}</h3>
        </div>
        <span data-testid="mcp-status" className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}>
          {t(`ai:mcpBridge.status.${status}`)}
        </span>
      </div>

      <p className="text-xs text-secondary">{t('ai:settings.mcp.description')}</p>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">{t('ai:mcpBridge.toggleLabel')}</p>
          <p className="text-xs text-tertiary mt-0.5">{t('ai:mcpBridge.toggleInfo')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label={t('ai:mcpBridge.toggleLabel')}
          onClick={() => saveMcpBridgeSettings({ enabled: !settings.enabled })}
          className={`w-10 h-5 rounded-full transition-colors relative p-0.5 inline-flex items-center shrink-0 ${settings.enabled ? 'bg-primary' : 'bg-card border border-strong'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.enabled ? 'translate-x-[20px]' : 'translate-x-0'}`} />
        </button>
      </div>

      {settings.enabled && autonomous && (
        <p role="status" className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-xl p-3">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{t('ai:mcpBridge.autonomousOn')}</span>
        </p>
      )}

      {settings.enabled && (
        <div className="space-y-6">
          <section aria-labelledby="mcp-values" className="space-y-3">
            <div>
              <h4 id="mcp-values" className="text-xs font-semibold text-primary">{t('ai:mcpBridge.values.title')}</h4>
              <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.values.hint')}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-secondary">{t('ai:mcpBridge.values.address')}</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-subtle border border-subtle text-xs font-mono text-primary">{endpoint}</code>
                <CopyButton text={endpoint} label={t('ai:mcpBridge.values.copyAddress')} />
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-secondary">{t('ai:mcpBridge.tokenLabel')}</span>
              <div className="flex items-center gap-2">
                {ownServer ? (
                  <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-subtle border border-subtle text-xs font-mono text-primary">
                    {settings.token ? (revealed ? settings.token : '••••••••••••••••') : '…'}
                  </code>
                ) : (
                  <input
                    id="mcp-bridge-token"
                    aria-label={t('ai:mcpBridge.tokenLabel')}
                    type={revealed ? 'text' : 'password'}
                    autoComplete="off"
                    value={settings.token}
                    onChange={(event) => saveMcpBridgeSettings({ token: event.target.value })}
                    className={fieldClass}
                  />
                )}
                <button
                  type="button"
                  aria-label={revealed ? t('ai:mcpBridge.hideToken') : t('ai:mcpBridge.showToken')}
                  onClick={() => setRevealed((value) => !value)}
                  className="shrink-0 p-2 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-secondary hover:text-primary transition-colors"
                >
                  {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <CopyButton text={settings.token} label={t('ai:mcpBridge.values.copyToken')} />
              </div>
            </div>

            {!ownServer && (
              <div className="space-y-1">
                <label htmlFor="mcp-bridge-address" className="text-xs font-medium text-secondary">{t('ai:mcpBridge.addressLabel')}</label>
                <input
                  id="mcp-bridge-address"
                  type="text"
                  value={addressDraft}
                  placeholder={STANDALONE_BRIDGE_URL}
                  onChange={(event) => saveAddress(event.target.value)}
                  className={fieldClass}
                />
                <p className={`text-[11px] ${addressInvalid ? 'text-warning' : 'text-tertiary'}`}>
                  {addressInvalid ? t('ai:mcpBridge.addressInvalid') : t('ai:mcpBridge.addressHelp')}
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="mcp-setup" className="space-y-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-primary" aria-hidden="true" />
              <h4 id="mcp-setup" className="text-xs font-semibold text-primary">{t('ai:mcpBridge.setup.title')}</h4>
            </div>
            <p className="text-[11px] text-secondary leading-relaxed">{t('ai:mcpBridge.setup.body')}</p>
            <pre aria-label={t('ai:mcpBridge.setup.title')} className="p-3 rounded-xl bg-subtle border border-subtle text-[11px] font-mono text-primary whitespace-pre-wrap max-h-32 overflow-y-auto">{MCP_SETUP_PROMPT}</pre>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(MCP_SETUP_PROMPT);
                setPromptCopied(true);
                setTimeout(() => setPromptCopied(false), 2500);
              }}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              {promptCopied ? <Check size={14} /> : <Copy size={14} />}
              <span>{promptCopied ? t('ai:mcpBridge.setup.copied') : t('ai:mcpBridge.setup.copy')}</span>
            </button>
          </section>

          <section aria-labelledby="mcp-manual" className="space-y-3">
            <h4 id="mcp-manual" className="text-xs font-semibold text-primary">{t('ai:mcpBridge.manual.title')}</h4>
            <McpClientPicker
              clientId={settings.client}
              onClientChange={(client) => saveMcpBridgeSettings({ client })}
              values={{ endpoint, token, ownServer }}
              mask={mask}
            />
            <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.manual.note')}</p>
          </section>

          {!ownServer && (
            <section aria-labelledby="mcp-start" className="space-y-2">
              <h4 id="mcp-start" className="text-xs font-semibold text-primary">{t('ai:mcpBridge.startTitle')}</h4>
              <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.startBridge')}</p>
              <CopyBlock title={t('ai:mcpBridge.startTitle')} text={MCP_SERVE_COMMANDS.join('\n')} />
            </section>
          )}

          <McpCommandList location={ownServer ? 'local' : 'online'} base={origin} token={token} mask={mask} />
        </div>
      )}
    </div>
  );
};

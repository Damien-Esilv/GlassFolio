import React, { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Cpu, Eye, EyeOff } from 'lucide-react';
import { buildClientSnippets, MCP_SERVE_COMMANDS } from '../../config/mcpClients';
import {
  STANDALONE_BRIDGE_URL,
  getMcpBridgeSettings,
  normalizeBridgeUrl,
  resolveBridgeBaseUrl,
  saveMcpBridgeSettings,
  subscribeMcpBridgeSettings,
} from '../../services/mcpBridge/mcpBridgeSettings';
import { getMcpBridgeStatus, subscribeMcpBridgeStatus, type McpBridgeStatus } from '../../services/mcpBridge/mcpBridgeStatus';

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

const CopyBlock: React.FC<{ title: string; text: string; display?: string }> = ({ title, text, display }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-secondary">{title}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors">
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          <span>{copied ? t('ai:mcpBridge.copied') : t('ai:mcpBridge.copy')}</span>
        </button>
      </div>
      <pre className="p-3 rounded-xl bg-subtle border border-subtle text-[11px] font-mono text-primary overflow-x-auto whitespace-pre-wrap break-all">{display ?? text}</pre>
    </div>
  );
};

/** Settings > AI & MCP: lets AI clients call GlassFolio's tools through a bridge on this computer. */
export const McpBridgeSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useSyncExternalStore(subscribeMcpBridgeSettings, getMcpBridgeSettings);
  const status = useSyncExternalStore(subscribeMcpBridgeStatus, getMcpBridgeStatus);
  const [revealed, setRevealed] = useState(false);
  const [addressDraft, setAddressDraft] = useState(settings.url);
  const [addressInvalid, setAddressInvalid] = useState(false);

  const baseUrl = resolveBridgeBaseUrl(settings);
  const ownServer = baseUrl === '';
  const endpoint = `${ownServer ? window.location.origin : baseUrl}/mcp`;
  const token = settings.token || '<token>';
  const snippets = buildClientSnippets({ endpoint, token, ownServer });
  // The snippets copy the real token; on screen it stays hidden until revealed
  const shown = (text: string): string => (revealed || !settings.token ? text : text.split(settings.token).join('••••••••'));

  const saveAddress = (value: string): void => {
    setAddressDraft(value);
    const normalized = normalizeBridgeUrl(value);
    setAddressInvalid(normalized === null);
    if (normalized !== null) saveMcpBridgeSettings({ url: normalized });
  };

  return (
    <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
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

      {settings.enabled && (
        <div className="space-y-4">
          {ownServer ? (
            <p className="text-xs text-secondary">
              {t('ai:mcpBridge.ownServerAddress')} <code className="font-mono text-primary">{endpoint}</code>
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="mcp-bridge-address" className="text-xs font-medium text-secondary">{t('ai:mcpBridge.addressLabel')}</label>
                <input
                  id="mcp-bridge-address"
                  type="text"
                  value={addressDraft}
                  placeholder={STANDALONE_BRIDGE_URL}
                  onChange={(event) => saveAddress(event.target.value)}
                  className="w-full bg-subtle text-primary border border-subtle rounded-lg px-3 py-2 text-xs font-mono focus:ring-primary focus:border-primary"
                />
                <p className={`text-[11px] ${addressInvalid ? 'text-warning' : 'text-tertiary'}`}>
                  {addressInvalid ? t('ai:mcpBridge.addressInvalid') : t('ai:mcpBridge.addressHelp')}
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="mcp-bridge-token" className="text-xs font-medium text-secondary">{t('ai:mcpBridge.tokenLabel')}</label>
                <input
                  id="mcp-bridge-token"
                  type={revealed ? 'text' : 'password'}
                  autoComplete="off"
                  value={settings.token}
                  onChange={(event) => saveMcpBridgeSettings({ token: event.target.value })}
                  className="w-full bg-subtle text-primary border border-subtle rounded-lg px-3 py-2 text-xs font-mono focus:ring-primary focus:border-primary"
                />
                <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.startBridge')}</p>
                <pre className="p-3 rounded-xl bg-subtle border border-subtle text-[11px] font-mono text-primary overflow-x-auto">{MCP_SERVE_COMMANDS.join('\n')}</pre>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{revealed ? t('ai:mcpBridge.hideToken') : t('ai:mcpBridge.showToken')}</span>
          </button>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-primary">{t('ai:mcpBridge.clients.title')}</h4>
            <CopyBlock title={t('ai:mcpBridge.clients.claudeCode')} text={snippets.claudeCode} display={shown(snippets.claudeCode)} />
            <CopyBlock title={t('ai:mcpBridge.clients.urlJson')} text={snippets.urlJson} display={shown(snippets.urlJson)} />
            <CopyBlock title={t('ai:mcpBridge.clients.stdioJson')} text={snippets.stdioJson} display={shown(snippets.stdioJson)} />
            <CopyBlock title={t('ai:mcpBridge.clients.codex')} text={snippets.codex} display={shown(snippets.codex)} />
            <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.clients.note')}</p>
          </div>
        </div>
      )}
    </div>
  );
};

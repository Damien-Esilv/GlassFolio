import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MCP_CLIENTS, getMcpClient, pickSnippet, renderSnippet, type McpTransport, type SnippetValues } from '../../config/mcpClients';
import { CopyBlock } from './CopyBlock';

interface McpClientPickerProps {
  clientId: string;
  onClientChange: (id: string) => void;
  values: SnippetValues;
  /** Hides the token on screen; the copy button still copies the real text. */
  mask: (text: string) => string;
}

/** One AI client at a time: pick it in a list, see only its configuration. The list is mcpClients.json. */
export const McpClientPicker: React.FC<McpClientPickerProps> = ({ clientId, onClientChange, values, mask }) => {
  const { t } = useTranslation();
  const [transport, setTransport] = useState<McpTransport | undefined>(undefined);
  const client = getMcpClient(clientId);
  const snippet = pickSnippet(client, transport);
  const text = renderSnippet(snippet, values);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="mcp-client" className="text-xs font-medium text-secondary">{t('ai:mcpBridge.manual.clientLabel')}</label>
        <select
          id="mcp-client"
          value={client.id}
          onChange={(event) => {
            setTransport(undefined);
            onClientChange(event.target.value);
          }}
          className="w-full bg-subtle text-primary border border-subtle rounded-lg px-3 py-2 text-xs focus:ring-primary focus:border-primary"
        >
          {MCP_CLIENTS.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
      </div>

      {client.snippets.length > 1 && (
        <div role="group" aria-label={t('ai:mcpBridge.manual.transportLabel')} className="inline-flex gap-1 bg-subtle p-1 rounded-xl border border-subtle">
          {client.snippets.map((entry) => (
            <button
              key={entry.transport}
              type="button"
              aria-pressed={entry.transport === snippet.transport}
              onClick={() => setTransport(entry.transport)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${entry.transport === snippet.transport ? 'bg-card text-primary shadow-sm border border-subtle' : 'text-secondary hover:text-primary'}`}
            >
              {t(`ai:mcpBridge.manual.transport.${entry.transport}`)}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.manual.where', { where: client.where })}</p>
      <CopyBlock title={`${client.name} · ${t(`ai:mcpBridge.manual.format.${snippet.format}`)}`} text={text} display={mask(text)} />
    </div>
  );
};

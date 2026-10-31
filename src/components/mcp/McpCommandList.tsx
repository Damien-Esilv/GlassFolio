import React from 'react';
import { useTranslation } from 'react-i18next';
import { commandsFor, type McpBridgeLocation } from '../../config/mcpCommands';
import { CopyBlock } from './CopyBlock';

interface McpCommandListProps {
  location: McpBridgeLocation;
  base: string;
  token: string;
  mask: (text: string) => string;
}

/** The commands to run and check the bridge, each with what it does, always visible and copyable. */
export const McpCommandList: React.FC<McpCommandListProps> = ({ location, base, token, mask }) => {
  const { t } = useTranslation();
  const commands = commandsFor(location);
  return (
    <section aria-labelledby="mcp-commands" className="space-y-3">
      <div>
        <h4 id="mcp-commands" className="text-xs font-semibold text-primary">{t('ai:mcpBridge.commands.title')}</h4>
        <p className="text-[11px] text-tertiary">{t('ai:mcpBridge.commands.intro')}</p>
      </div>
      <ul className="space-y-4">
        {commands.map((command) => {
          const text = command.lines({ base, token }).join('\n');
          return (
            <li key={`${command.id}-${command.locations.join('')}`} className="space-y-1.5">
              <p className="text-xs font-semibold text-primary">{t(`ai:mcpBridge.commands.items.${command.id}.title`)}</p>
              <p className="text-[11px] text-tertiary leading-relaxed">{t(`ai:mcpBridge.commands.items.${command.id}.${location}`, { defaultValue: t(`ai:mcpBridge.commands.items.${command.id}.desc`) })}</p>
              <CopyBlock title={t(`ai:mcpBridge.commands.items.${command.id}.title`)} text={text} display={mask(text)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
};

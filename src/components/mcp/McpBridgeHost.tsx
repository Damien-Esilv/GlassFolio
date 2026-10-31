import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { aiSettingsService } from '../../services/ai/aiSettingsService';
import { aiToolRegistry } from '../../services/ai/aiToolRegistry';
import { guardrailsService } from '../../services/ai/guardrailsService';
import { vaultService } from '../../services/security/vaultService';
import { McpBridgeClient } from '../../services/mcpBridge/mcpBridgeClient';
import { createMcpBridgeExecutor } from '../../services/mcpBridge/mcpBridgeExecutor';
import { mcpApprovalStore } from '../../services/mcpBridge/mcpApprovalStore';
import { setMcpBridgeStatus } from '../../services/mcpBridge/mcpBridgeStatus';
import {
  fetchOwnServerToken,
  getMcpBridgeSettings,
  resolveBridgeBaseUrl,
  saveMcpBridgeSettings,
  subscribeMcpBridgeSettings,
} from '../../services/mcpBridge/mcpBridgeSettings';
import { AIActionApprovalCard } from '../ai/AIActionApprovalCard';

const buildExecutor = (getLanguage: () => 'en' | 'fr') => createMcpBridgeExecutor({
  getTool: (name) => aiToolRegistry.getTool(name),
  executeTool: (name, args, context) => aiToolRegistry.executeTool(name, args, context),
  createPendingAction: (toolName, type, params, preview) => guardrailsService.createPendingAction(toolName, type, params, preview),
  approveAction: (id, context) => guardrailsService.approveAction(id, context),
  rejectAction: (id) => guardrailsService.rejectAction(id),
  getPendingAction: (id) => guardrailsService.getPendingAction(id),
  requestApproval: (proposal) => mcpApprovalStore.request(proposal),
  onSettled: (proposal) => mcpApprovalStore.update(proposal),
  redact: (text) => guardrailsService.redactSensitiveExfiltrations(text),
  isVaultUnlocked: () => vaultService.isUnlocked(),
  isReadOnly: () => aiSettingsService.getSettings().executionMode === 'read_only',
  context: () => ({ language: getLanguage(), currency: 'EUR' }),
});

/**
 * Connects this tab to the MCP bridge while the user allowed AI clients and the vault is unlocked, and shows
 * the changes that an AI client asks for, which wait for the user's approval.
 */
export const McpBridgeHost: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // The tools answer in the language of the interface at the time of the call, without reconnecting when it changes
  const languageRef = useRef<'en' | 'fr'>('fr');
  languageRef.current = i18n?.language === 'en' ? 'en' : 'fr';
  const executeForAiClient = useMemo(() => buildExecutor(() => languageRef.current), []);
  const settings = useSyncExternalStore(subscribeMcpBridgeSettings, getMcpBridgeSettings);
  const approvals = useSyncExternalStore(mcpApprovalStore.subscribe, mcpApprovalStore.getSnapshot);
  const [unlocked, setUnlocked] = useState<boolean>(() => vaultService.isUnlocked());
  const signedIn = Boolean(user);

  useEffect(() => vaultService.subscribeStatus((status) => setUnlocked(status === 'unlocked')), []);

  useEffect(() => {
    if (!settings.enabled) {
      setMcpBridgeStatus('off');
      return undefined;
    }
    if (!signedIn || !unlocked) {
      setMcpBridgeStatus('locked');
      mcpApprovalStore.rejectAll('locked');
      return undefined;
    }

    const baseUrl = resolveBridgeBaseUrl(settings);
    let cancelled = false;
    let client: McpBridgeClient | null = null;
    void (async () => {
      let token = settings.token;
      if (!token && baseUrl === '') {
        token = (await fetchOwnServerToken()) ?? '';
        if (token && !cancelled) {
          saveMcpBridgeSettings({ token }); // this effect restarts with the token
          return;
        }
      }
      if (cancelled) return;
      if (!token) {
        setMcpBridgeStatus(baseUrl === '' ? 'unreachable' : 'needsToken');
        return;
      }
      client = new McpBridgeClient({ baseUrl, token, execute: executeForAiClient, onStatus: setMcpBridgeStatus });
      client.start();
    })();

    return () => {
      cancelled = true;
      client?.stop();
    };
  }, [settings, signedIn, unlocked, executeForAiClient]);

  if (approvals.length === 0) return null;
  return (
    <div role="region" aria-live="polite" aria-label={t('ai:mcpBridge.approval.title')} className="fixed bottom-4 left-4 z-[70] w-[min(28rem,calc(100vw-2rem))] space-y-3">
      {approvals.map((proposal) => (
        <div key={proposal.id} className="space-y-2">
          {proposal.status === 'pending' && (
            <p className="text-xs font-semibold text-primary px-1">{t('ai:mcpBridge.approval.title')}</p>
          )}
          <AIActionApprovalCard
            proposal={proposal}
            onApprove={async (id) => mcpApprovalStore.decide(id, 'approved')}
            onReject={(id) => mcpApprovalStore.decide(id, 'rejected')}
          />
        </div>
      ))}
    </div>
  );
};

import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Server,
  Key,
  Shield,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Cpu,
  Brain,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { aiSettingsService } from '../../src/services/ai/aiSettingsService';
import { AIProviderType, AIExecutionMode, AISettings } from '../../src/services/ai/types';
import Button from '../Button';

export const AISettingsTab: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AISettings>(() => aiSettingsService.getSettings());
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [ollamaResult, setOllamaResult] = useState<{
    ok: boolean;
    models: string[];
    error?: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleProviderSelect = (provider: AIProviderType) => {
    setSettings((prev) => ({ ...prev, activeProvider: provider }));
    setSaveSuccess(false);
  };

  const handleModeSelect = (mode: AIExecutionMode) => {
    setSettings((prev) => ({ ...prev, executionMode: mode }));
    setSaveSuccess(false);
  };

  const handleTestOllama = async () => {
    setIsTestingOllama(true);
    setOllamaResult(null);
    try {
      const res = await aiSettingsService.testOllamaConnection(settings.ollamaEndpoint);
      setOllamaResult(res);
      if (res.ok && res.models.length > 0 && !res.models.includes(settings.ollamaModel)) {
        setSettings((prev) => ({ ...prev, ollamaModel: res.models[0] }));
      }
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    aiSettingsService.saveSettings(settings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        glassfolio: {
          command: 'node',
          args: [`${window.location.origin ? '/absolute/path/to/GlassFolio' : '.'}/mcp-server/index.mjs`],
        },
      },
    },
    null,
    2
  );

  const handleCopyMcpConfig = () => {
    navigator.clipboard.writeText(mcpConfigJson);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const providers: Array<{ id: AIProviderType; nameKey: string; descKey: string }> = [
    {
      id: 'mock',
      nameKey: 'ai:settings.providers.mock.name',
      descKey: 'ai:settings.providers.mock.description',
    },
    {
      id: 'ollama',
      nameKey: 'ai:settings.providers.ollama.name',
      descKey: 'ai:settings.providers.ollama.description',
    },
    {
      id: 'openai',
      nameKey: 'ai:settings.providers.openai.name',
      descKey: 'ai:settings.providers.openai.description',
    },
    {
      id: 'anthropic',
      nameKey: 'ai:settings.providers.anthropic.name',
      descKey: 'ai:settings.providers.anthropic.description',
    },
    {
      id: 'openrouter',
      nameKey: 'ai:settings.providers.openrouter.name',
      descKey: 'ai:settings.providers.openrouter.description',
    },
    {
      id: 'groq',
      nameKey: 'ai:settings.providers.groq.name',
      descKey: 'ai:settings.providers.groq.description',
    },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-in fade-in">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary">{t('ai:settings.title')}</h2>
            <p className="text-xs text-secondary">{t('ai:settings.subtitle')}</p>
          </div>
        </div>

        <Button type="submit" variant="primary" size="sm" className="shrink-0 whitespace-nowrap">
          {saveSuccess ? (
            <span className="flex items-center gap-2">
              <Check size={16} />
              {t('ai:settings.saved')}
            </span>
          ) : (
            t('ai:settings.save')
          )}
        </Button>
      </div>

      {/* 2. Provider Selection */}
      <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-primary">{t('ai:settings.providerCard.title')}</h3>
          <p className="text-xs text-secondary">{t('ai:settings.providerCard.description')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map((p) => {
            const isSelected = settings.activeProvider === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleProviderSelect(p.id)}
                className={`cursor-pointer p-4 rounded-xl border transition-all text-left space-y-1.5 ${
                  isSelected
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-subtle/50 hover:bg-subtle border-subtle'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">{t(p.nameKey)}</span>
                  {isSelected && <Check size={14} className="text-primary" />}
                </div>
                <p className="text-[11px] text-tertiary leading-relaxed">{t(p.descKey)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Reasoning & Thinking Mode (<think>) */}
      <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-brand shrink-0" />
            <h3 className="text-sm font-semibold text-primary">{t('ai:settings.thinkingMode.title')}</h3>
          </div>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              settings.enableThinking
                ? 'bg-primary/10 text-primary border-primary/25'
                : 'bg-subtle text-tertiary border-subtle'
            }`}
          >
            {settings.enableThinking
              ? t('ai:settings.thinkingMode.enabled')
              : t('ai:settings.thinkingMode.disabled')}
          </span>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          {t('ai:settings.thinkingMode.description')}
        </p>

        <div className="flex items-center justify-between p-3.5 rounded-xl bg-subtle/70 border border-subtle">
          <div className="space-y-0.5 pr-4">
            <span className="text-xs font-semibold text-primary">
              {settings.enableThinking
                ? t('ai:settings.thinkingMode.enabled')
                : t('ai:settings.thinkingMode.disabled')}
            </span>
            <p className="text-[11px] text-tertiary">
              {t('ai:settings.thinkingMode.description')}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.enableThinking}
              onChange={(e) => setSettings({ ...settings, enableThinking: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-card border border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:border-subtle after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white" />
          </label>
        </div>
      </div>

      {/* 4. Provider Specific Configurations */}
      {settings.activeProvider === 'ollama' && (
        <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-primary">{t('ai:settings.ollamaConfigTitle')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.ollama.endpoint')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={settings.ollamaEndpoint}
                  onChange={(e) => setSettings({ ...settings, ollamaEndpoint: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="flex-1 bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={handleTestOllama}
                  disabled={isTestingOllama}
                  className="px-3 py-2 rounded-xl bg-subtle border border-subtle hover:bg-card text-xs font-medium text-primary transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isTestingOllama ? 'animate-spin' : ''} />
                  <span>{isTestingOllama ? t('ai:settings.ollama.testing') : t('ai:settings.ollama.testConnection')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.ollama.model')}</label>
              {ollamaResult?.models && ollamaResult.models.length > 0 ? (
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                  className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
                >
                  {ollamaResult.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                  placeholder="llama3.2:latest"
                  className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
                />
              )}
            </div>
          </div>

          {/* Thinking / Reasoning Mode Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-subtle/70 border border-subtle">
            <div className="space-y-0.5 pr-4">
              <div className="flex items-center gap-2">
                <Brain size={15} className="text-brand shrink-0" />
                <span className="text-xs font-semibold text-primary">{t('ai:settings.thinkingMode.title')}</span>
              </div>
              <p className="text-[11px] text-secondary leading-relaxed">
                {t('ai:settings.thinkingMode.description')}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.enableThinking}
                onChange={(e) => setSettings({ ...settings, enableThinking: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-card border border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:border-subtle after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white" />
            </label>
          </div>

          {ollamaResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                ollamaResult.ok
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-error/10 border-error/30 text-error'
              }`}
            >
              <span>
                {ollamaResult.ok
                  ? t('ai:settings.ollama.success', { count: ollamaResult.models.length })
                  : `${t('ai:settings.ollama.failure')} (${ollamaResult.error})`}
              </span>
            </div>
          )}
        </div>
      )}

      {['openai', 'anthropic', 'openrouter', 'groq'].includes(settings.activeProvider) && (
        <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-primary">{t('ai:settings.cloudConfigTitle')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.cloud.apiKey')}</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  placeholder={t('ai:settings.cloud.apiKeyPlaceholder')}
                  className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-2.5 text-secondary hover:text-primary transition-colors"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.cloud.model')}</label>
              <input
                type="text"
                value={settings.cloudModel}
                onChange={(e) => setSettings({ ...settings, cloudModel: e.target.value })}
                placeholder={t('ai:settings.cloud.modelPlaceholder')}
                className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Thinking / Reasoning Mode Toggle for Cloud */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-subtle/70 border border-subtle">
            <div className="space-y-0.5 pr-4">
              <div className="flex items-center gap-2">
                <Brain size={15} className="text-brand shrink-0" />
                <span className="text-xs font-semibold text-primary">{t('ai:settings.thinkingMode.title')}</span>
              </div>
              <p className="text-[11px] text-secondary leading-relaxed">
                {t('ai:settings.thinkingMode.description')}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.enableThinking}
                onChange={(e) => setSettings({ ...settings, enableThinking: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-card border border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:border-subtle after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white" />
            </label>
          </div>
        </div>
      )}

      {/* 4. Security & Guardrails */}
      <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-primary">{t('ai:settings.security.title')}</h3>
        </div>
        <p className="text-xs text-secondary">{t('ai:settings.security.description')}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => handleModeSelect('supervised')}
            className={`cursor-pointer p-4 rounded-xl border transition-all text-left space-y-1.5 ${
              settings.executionMode === 'supervised'
                ? 'bg-primary/10 border-primary'
                : 'bg-subtle/50 hover:bg-subtle border-subtle'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary">{t('ai:settings.security.supervised')}</span>
              {settings.executionMode === 'supervised' && <Check size={14} className="text-primary" />}
            </div>
            <p className="text-[11px] text-tertiary leading-relaxed">{t('ai:settings.security.supervisedDesc')}</p>
          </div>

          <div
            onClick={() => handleModeSelect('read_only')}
            className={`cursor-pointer p-4 rounded-xl border transition-all text-left space-y-1.5 ${
              settings.executionMode === 'read_only'
                ? 'bg-primary/10 border-primary'
                : 'bg-subtle/50 hover:bg-subtle border-subtle'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary">{t('ai:settings.security.readOnly')}</span>
              {settings.executionMode === 'read_only' && <Check size={14} className="text-primary" />}
            </div>
            <p className="text-[11px] text-tertiary leading-relaxed">{t('ai:settings.security.readOnlyDesc')}</p>
          </div>
        </div>
      </div>

      {/* 5. External MCP Server Section */}
      <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-primary">{t('ai:settings.mcp.title')}</h3>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
            {t('ai:settings.mcp.statusReady')}
          </span>
        </div>

        <p className="text-xs text-secondary">{t('ai:settings.mcp.description')}</p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary">{t('ai:settings.mcp.configLabel')}</span>
            <button
              type="button"
              onClick={handleCopyMcpConfig}
              className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
            >
              {isCopied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              <span>{isCopied ? t('ai:settings.mcp.copied') : t('ai:settings.mcp.copyConfig')}</span>
            </button>
          </div>

          <pre className="p-3 rounded-xl bg-subtle border border-subtle text-[11px] font-mono text-primary overflow-x-auto">
            {mcpConfigJson}
          </pre>
        </div>
      </div>
    </form>
  );
};

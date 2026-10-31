import React, { useState } from 'react';
import {
  Sparkles,
  Server,
  Key,
  Shield,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Brain,
  Cloud,
  Info,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { aiSettingsService } from '../../services/ai/aiSettingsService';
import { AIProviderType, AIExecutionMode, AISettings } from '../../services/ai/types';
import Button from '../Button';
import { McpBridgeSettings } from '../settings/McpBridgeSettings';

type AICategory = 'ollama' | 'cloud' | 'mock';

interface CloudProviderOption {
  id: AIProviderType;
  name: string;
  keyPlaceholder: string;
  modelPlaceholder: string;
}

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
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudResult, setCloudResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const updateAISettings = (newSettings: AISettings) => {
    setSettings(newSettings);
    aiSettingsService.saveSettings(newSettings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const isCloudProvider = (provider: AIProviderType): boolean =>
    ['groq', 'openai', 'anthropic', 'gemini', 'openrouter'].includes(provider);

  const getCategoryFromProvider = (provider: AIProviderType): AICategory => {
    if (provider === 'ollama') return 'ollama';
    if (provider === 'mock') return 'mock';
    return 'cloud';
  };

  const currentCategory = getCategoryFromProvider(settings.activeProvider);

  const cloudOptions: CloudProviderOption[] = [
    {
      id: 'groq',
      name: t('ai:settings.providers.groq.name'),
      keyPlaceholder: 'gsk_...',
      modelPlaceholder: t('ai:settings.cloud.modelPlaceholder'),
    },
    {
      id: 'openai',
      name: t('ai:settings.providers.openai.name'),
      keyPlaceholder: 'sk-proj-...',
      modelPlaceholder: t('ai:settings.cloud.modelPlaceholder'),
    },
    {
      id: 'anthropic',
      name: t('ai:settings.providers.anthropic.name'),
      keyPlaceholder: 'sk-ant-...',
      modelPlaceholder: t('ai:settings.cloud.modelPlaceholder'),
    },
    {
      id: 'gemini',
      name: t('ai:settings.providers.gemini.name'),
      keyPlaceholder: 'AIzaSy...',
      modelPlaceholder: t('ai:settings.cloud.modelPlaceholder'),
    },
    {
      id: 'openrouter',
      name: t('ai:settings.providers.openrouter.name'),
      keyPlaceholder: 'sk-or-...',
      modelPlaceholder: t('ai:settings.cloud.modelPlaceholder'),
    },
  ];

  const activeCloudProvider: AIProviderType = isCloudProvider(settings.activeProvider)
    ? settings.activeProvider
    : 'groq';

  const currentCloudOption =
    cloudOptions.find((opt) => opt.id === activeCloudProvider) || cloudOptions[0];

  const handleCategorySelect = (category: AICategory) => {
    let nextProvider: AIProviderType = 'mock';
    if (category === 'ollama') {
      nextProvider = 'ollama';
    } else if (category === 'mock') {
      nextProvider = 'mock';
    } else {
      nextProvider = isCloudProvider(settings.activeProvider) ? settings.activeProvider : 'groq';
    }
    const currentKeys = {
      ...(settings.providerApiKeys || {}),
      [settings.activeProvider]: settings.apiKey,
    };
    const currentModels = {
      ...(settings.providerModels || {}),
      [settings.activeProvider]: settings.cloudModel,
    };
    updateAISettings({
      ...settings,
      activeProvider: nextProvider,
      apiKey: currentKeys[nextProvider] || '',
      cloudModel: currentModels[nextProvider] || '',
      providerApiKeys: currentKeys,
      providerModels: currentModels,
    });
  };

  const handleCloudProviderChange = (newProvider: AIProviderType) => {
    const currentKeys = {
      ...(settings.providerApiKeys || {}),
      [settings.activeProvider]: settings.apiKey,
    };
    const currentModels = {
      ...(settings.providerModels || {}),
      [settings.activeProvider]: settings.cloudModel,
    };
    updateAISettings({
      ...settings,
      activeProvider: newProvider,
      apiKey: currentKeys[newProvider] || '',
      cloudModel: currentModels[newProvider] || '',
      providerApiKeys: currentKeys,
      providerModels: currentModels,
    });
    setCloudResult(null);
  };

  const handleModeSelect = (mode: AIExecutionMode) => {
    updateAISettings({ ...settings, executionMode: mode });
  };

  const handleTestOllama = async () => {
    setIsTestingOllama(true);
    setOllamaResult(null);
    try {
      const res = await aiSettingsService.testOllamaConnection(settings.ollamaEndpoint);
      setOllamaResult(res);
      if (res.ok && res.models.length > 0 && !res.models.includes(settings.ollamaModel)) {
        updateAISettings({ ...settings, ollamaModel: res.models[0] });
      }
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleTestCloud = async () => {
    if (!settings.apiKey?.trim()) return;
    setIsTestingCloud(true);
    setCloudResult(null);
    try {
      const res = await aiSettingsService.testCloudConnection(
        activeCloudProvider,
        settings.apiKey,
        settings.cloudModel
      );
      setCloudResult(res);
    } finally {
      setIsTestingCloud(false);
    }
  };

  const categoryCards: Array<{
    id: AICategory;
    titleKey: string;
    descKey: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'mock',
      titleKey: 'ai:settings.categories.mock.name',
      descKey: 'ai:settings.categories.mock.description',
      icon: <Sparkles size={20} className="text-primary" />,
    },
    {
      id: 'ollama',
      titleKey: 'ai:settings.categories.ollama.name',
      descKey: 'ai:settings.categories.ollama.description',
      icon: <Server size={20} className="text-primary" />,
    },
    {
      id: 'cloud',
      titleKey: 'ai:settings.categories.cloud.name',
      descKey: 'ai:settings.categories.cloud.description',
      icon: <Cloud size={20} className="text-primary" />,
    },
  ];

  return (
    <div className="space-y-6">
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

        <div className="flex items-center gap-2 shrink-0">
          {saveSuccess ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/30 text-xs font-medium animate-fade-in">
              <Check size={14} />
              {t('ai:settings.saved')}
            </span>
          ) : (
            <span className="text-[11px] text-tertiary">
              {t('tax:settings.autoSaved')}
            </span>
          )}
        </div>
      </div>

      {/* 2. Provider Category Selection (3 Clean Tabs) */}
      <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-primary">{t('ai:settings.providerCard.title')}</h3>
          <p className="text-xs text-secondary">{t('ai:settings.providerCard.description')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {categoryCards.map((c) => {
            const isSelected = currentCategory === c.id;
            return (
              <div
                key={c.id}
                onClick={() => handleCategorySelect(c.id)}
                className={`cursor-pointer p-4 rounded-xl border transition-all text-left space-y-2 ${
                  isSelected
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-subtle/50 hover:bg-subtle border-subtle'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {c.icon}
                    <span className="text-xs font-bold text-primary">{t(c.titleKey)}</span>
                  </div>
                  {isSelected && <Check size={16} className="text-primary" />}
                </div>
                <p className="text-[11px] text-tertiary leading-relaxed">{t(c.descKey)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Provider Specific Configurations */}
      {currentCategory === 'ollama' && (
        <div className="p-6 rounded-2xl bg-card border border-subtle space-y-4">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-primary">{t('ai:settings.ollamaConfigTitle')}</h3>
          </div>

          {/* Online / HTTPS Mixed Content Educational Notice */}
          <div className="p-4 rounded-xl bg-subtle/80 border border-subtle flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0 mt-0.5">
              <Info size={16} />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-primary">
                {t('ai:settings.ollama.onlineNoticeTitle')}
              </h4>
              <p className="text-[11px] text-secondary leading-relaxed">
                {t('ai:settings.ollama.onlineNoticeBody')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.ollama.endpoint')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={settings.ollamaEndpoint}
                  onChange={(e) => updateAISettings({ ...settings, ollamaEndpoint: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="min-w-0 flex-1 bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={handleTestOllama}
                  disabled={isTestingOllama}
                  className="whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl bg-subtle border border-subtle hover:bg-card text-xs font-medium text-primary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={`shrink-0 ${isTestingOllama ? 'animate-spin' : ''}`} />
                  <span className="whitespace-nowrap">{isTestingOllama ? t('ai:settings.ollama.testing') : t('ai:settings.ollama.testConnection')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.ollama.model')}</label>
              {ollamaResult?.models && ollamaResult.models.length > 0 ? (
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => updateAISettings({ ...settings, ollamaModel: e.target.value })}
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
                  onChange={(e) => updateAISettings({ ...settings, ollamaModel: e.target.value })}
                  placeholder="llama3.2:latest"
                  className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
                />
              )}
            </div>
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

      {currentCategory === 'cloud' && (
        <div className="p-5 rounded-2xl bg-card border border-subtle space-y-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-primary" />
            <h3 className="text-xs font-semibold text-primary">{t('ai:settings.cloudConfigTitle')}</h3>
          </div>

          {/* 1. Cloud Provider Selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">{t('ai:settings.cloud.serviceLabel')}</label>
            <select
              value={activeCloudProvider}
              onChange={(e) => handleCloudProviderChange(e.target.value as AIProviderType)}
              className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs font-medium"
            >
              {cloudOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. API Key with Test Connection */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">{t('ai:settings.cloud.apiKey')}</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={(e) => {
                    const newKey = e.target.value;
                    const updatedKeys = {
                      ...(settings.providerApiKeys || {}),
                      [settings.activeProvider]: newKey,
                    };
                    updateAISettings({ ...settings, apiKey: newKey, providerApiKeys: updatedKeys });
                  }}
                  placeholder={currentCloudOption.keyPlaceholder}
                  className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-2 text-secondary hover:text-primary transition-colors"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestCloud}
                disabled={isTestingCloud || !settings.apiKey?.trim()}
                className="whitespace-nowrap shrink-0 px-3 py-2 rounded-xl bg-subtle border border-subtle hover:bg-card text-xs font-medium text-primary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={13} className={`shrink-0 ${isTestingCloud ? 'animate-spin' : ''}`} />
                <span>{isTestingCloud ? t('ai:settings.cloud.testing') : t('ai:settings.cloud.testConnection')}</span>
              </button>
            </div>
          </div>

          {/* 3. Model Identifier (Stacked underneath) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-secondary">{t('ai:settings.cloud.model')}</label>
              {!settings.cloudModel?.trim() && (
                <span className="text-[10px] text-warning font-medium">
                  {t('ai:settings.cloud.modelRequiredNotice')}
                </span>
              )}
            </div>
            <input
              type="text"
              value={settings.cloudModel}
              onChange={(e) => {
                const newModel = e.target.value;
                const updatedModels = {
                  ...(settings.providerModels || {}),
                  [settings.activeProvider]: newModel,
                };
                updateAISettings({ ...settings, cloudModel: newModel, providerModels: updatedModels });
              }}
              placeholder={currentCloudOption.modelPlaceholder || t('ai:settings.cloud.modelPlaceholder')}
              className="w-full bg-subtle text-primary border border-subtle focus:ring-1 focus:ring-primary focus:border-primary rounded-xl px-3 py-2 text-xs"
            />
            <p className="text-[11px] text-tertiary">
              {t('ai:settings.cloud.modelHelp')}
            </p>
          </div>

          {/* Test Feedback Message */}
          {cloudResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                cloudResult.ok
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-error/10 border-error/30 text-error'
              }`}
            >
              <span>
                {cloudResult.ok
                  ? t('ai:settings.cloud.success')
                  : `${t('ai:settings.cloud.failure')} (${cloudResult.error})`}
              </span>
            </div>
          )}
        </div>
      )}

      {currentCategory === 'mock' && (
        <div className="p-6 rounded-2xl bg-card border border-subtle space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-primary">{t('ai:settings.providers.mock.name')}</h3>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            {t('ai:settings.providers.mock.description')}
          </p>
        </div>
      )}

      {/* 4. Reasoning & Thinking Mode (<think>) */}
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
              onChange={(e) => updateAISettings({ ...settings, enableThinking: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-card border border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:border-subtle after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white" />
          </label>
        </div>
      </div>

      {/* 5. Security & Guardrails */}
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

      {/* 6. MCP bridge: AI clients use the tools of this tab */}
      <McpBridgeSettings />
    </div>
  );
};

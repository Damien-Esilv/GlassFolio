import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Trash2, Settings, Bot, Loader2, AlertCircle, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { aiService } from '../../src/services/ai/aiService';
import { aiSettingsService } from '../../src/services/ai/aiSettingsService';
import { ChatMessage } from '../../src/services/ai/types';
import { AIActionApprovalCard } from './AIActionApprovalCard';
import { AIMarkdownRenderer } from './AIMarkdownRenderer';

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIChatDrawer: React.FC<AIChatDrawerProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOllamaColdStart, setIsOllamaColdStart] = useState(false);
  const [isLongLoading, setIsLongLoading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const settings = aiSettingsService.getSettings();

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading) {
      if (settings.activeProvider === 'ollama') {
        aiSettingsService
          .checkOllamaModelLoaded(settings.ollamaEndpoint, settings.ollamaModel)
          .then((isLoaded) => {
            setIsOllamaColdStart(!isLoaded);
          })
          .catch(() => {});
        timer = setTimeout(() => {
          setIsLongLoading(true);
        }, 3500);
      }
    } else {
      setIsOllamaColdStart(false);
      setIsLongLoading(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, settings.activeProvider, settings.ollamaEndpoint, settings.ollamaModel]);

  useEffect(() => {
    setMessages(aiService.getMessages());
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async (content: string) => {
    const text = content.trim();
    if (!text || isLoading) return;

    setInputValue('');
    setIsLoading(true);

    // 1. Immediately record and display user message in UI
    aiService.addUserMessage(text);
    setMessages([...aiService.getMessages()]);

    try {
      const updated = await aiService.processAssistantTurn({
        language: i18n.language === 'en' ? 'en' : 'fr',
        currency: 'EUR',
      });
      setMessages([...updated]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (messageId: string) => {
    const text = editContent.trim();
    if (!text || isLoading) return;

    setEditingMessageId(null);
    setIsLoading(true);

    // Truncate in local UI immediately to show the edited prompt + thinking state
    const targetIdx = messages.findIndex((m) => m.id === messageId);
    const prefix = targetIdx !== -1 ? messages.slice(0, targetIdx) : [];
    const tempUserMsg: ChatMessage = {
      id: messageId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages([...prefix, tempUserMsg]);

    try {
      const updated = await aiService.editMessageAndRegenerate(messageId, text, {
        language: i18n.language === 'en' ? 'en' : 'fr',
        currency: 'EUR',
      });
      setMessages([...updated]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  const handleClearHistory = () => {
    aiService.clearMessages();
    setMessages([]);
    setEditingMessageId(null);
  };

  const handleApproveAction = async (actionId: string) => {
    await aiService.approveAction(actionId, {
      language: i18n.language === 'en' ? 'en' : 'fr',
      currency: 'EUR',
    });
    setMessages([...aiService.getMessages()]);
  };

  const handleRejectAction = (actionId: string) => {
    aiService.rejectAction(actionId);
    setMessages([...aiService.getMessages()]);
  };

  const providerBadgeLabel = () => {
    switch (settings.activeProvider) {
      case 'ollama':
        return t('ai:drawer.status.ollama');
      case 'openai':
      case 'anthropic':
      case 'gemini':
      case 'openrouter':
      case 'groq':
        return t('ai:drawer.status.cloud');
      case 'mock':
      default:
        return t('ai:drawer.status.demo');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className="fixed inset-y-0 right-0 w-full sm:w-[420px] md:w-[500px] bg-card border-l border-subtle z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-16 px-4 border-b border-subtle flex items-center justify-between bg-card/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-primary">{t('ai:drawer.title')}</h2>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-subtle border border-subtle text-secondary">
                  {providerBadgeLabel()}
                </span>
              </div>
              <p className="text-[11px] text-tertiary">{t('ai:drawer.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Link
              to="/settings?tab=ai"
              onClick={onClose}
              className="p-2 text-secondary hover:text-primary hover:bg-subtle rounded-lg transition-colors"
              title={t('ai:drawer.openSettings')}
              aria-label={t('ai:drawer.openSettings')}
            >
              <Settings size={17} />
            </Link>
            <button
              onClick={handleClearHistory}
              className="p-2 text-secondary hover:text-error hover:bg-subtle rounded-lg transition-colors"
              title={t('ai:drawer.clearHistory')}
              aria-label={t('ai:drawer.clearHistory')}
            >
              <Trash2 size={17} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-secondary hover:text-primary hover:bg-subtle rounded-lg transition-colors"
              title={t('ai:drawer.close')}
              aria-label={t('ai:drawer.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center p-6 space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-subtle border border-subtle flex items-center justify-center text-primary">
                <Bot size={28} />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <h3 className="text-sm font-semibold text-primary">{t('ai:drawer.title')}</h3>
                <p className="text-xs text-secondary leading-relaxed">
                  {t('ai:drawer.emptyConversation')}
                </p>
              </div>

              {/* Quick suggestions chips */}
              <div className="w-full space-y-2 pt-2">
                <button
                  onClick={() => handleSend(t('ai:chips.portfolioSummaryPrompt'))}
                  className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
                >
                  <span>{t('ai:chips.portfolioSummary')}</span>
                  <span className="text-tertiary">→</span>
                </button>
                <button
                  onClick={() => handleSend(t('ai:chips.assetAllocationPrompt'))}
                  className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
                >
                  <span>{t('ai:chips.assetAllocation')}</span>
                  <span className="text-tertiary">→</span>
                </button>
                <button
                  onClick={() => handleSend(t('ai:chips.taxOptimizationPrompt'))}
                  className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
                >
                  <span>{t('ai:chips.taxOptimization')}</span>
                  <span className="text-tertiary">→</span>
                </button>
                <button
                  onClick={() => handleSend(t('ai:chips.goalsProgressPrompt'))}
                  className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
                >
                  <span>{t('ai:chips.goalsProgress')}</span>
                  <span className="text-tertiary">→</span>
                </button>
                <button
                  onClick={() => handleSend(t('ai:chips.recordBuyPrompt'))}
                  className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
                >
                  <span>{t('ai:chips.recordBuy')}</span>
                  <span className="text-tertiary">→</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                // Ignore raw tool result messages in user view
                if (msg.role === 'tool') return null;

                const isUser = msg.role === 'user';
                const isEditingThis = editingMessageId === msg.id;

                if (isUser) {
                  return (
                    <div key={msg.id} className="flex flex-col items-end space-y-1">
                      {isEditingThis ? (
                        <div className="w-full max-w-[92%] rounded-2xl p-3 bg-card border border-primary/40 space-y-2.5 shadow-lg">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full bg-subtle border border-subtle text-primary rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-2.5 py-1 text-xs font-medium text-secondary hover:text-primary rounded-lg hover:bg-subtle transition-colors"
                            >
                              {t('ai:edit.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(msg.id)}
                              className="px-3 py-1 text-xs font-semibold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                            >
                              {t('ai:edit.saveAndSubmit')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-center gap-1.5 max-w-[88%]">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(msg)}
                            disabled={isLoading}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-tertiary hover:text-primary hover:bg-subtle rounded-lg transition-all disabled:hidden"
                            title={t('ai:edit.editMessage')}
                            aria-label={t('ai:edit.editMessage')}
                          >
                            <Pencil size={13} />
                          </button>
                          <div className="rounded-2xl p-3 text-xs leading-relaxed bg-primary/10 text-primary font-medium rounded-tr-sm border border-primary/20">
                            <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Assistant Message
                return (
                  <div key={msg.id} className="flex flex-col items-start space-y-1">
                    <div className="max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed bg-subtle text-primary rounded-tl-sm border border-subtle">
                      <AIMarkdownRenderer content={msg.content} />

                      {msg.pendingAction && (
                        <AIActionApprovalCard
                          proposal={msg.pendingAction}
                          onApprove={handleApproveAction}
                          onReject={handleRejectAction}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Thinking / Processing bubble right below the last message */}
              {isLoading && (
                <div className="flex flex-col space-y-1.5 p-3 rounded-2xl bg-subtle border border-subtle text-xs max-w-[85%] animate-pulse">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                    <span className="font-semibold text-primary">
                      {settings.activeProvider === 'ollama'
                        ? isOllamaColdStart
                          ? t('ai:chat.ollamaModelColdStart', { model: settings.ollamaModel })
                          : t('ai:chat.ollamaLoadingModel', { model: settings.ollamaModel })
                        : t('ai:chat.thinking')}
                    </span>
                  </div>
                  {settings.activeProvider === 'ollama' && isLongLoading && (
                    <p className="text-[11px] text-tertiary pl-5 leading-relaxed">
                      {t('ai:chat.ollamaLoadingVram')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input Area */}
        <div className="p-3 border-t border-subtle bg-card/90 space-y-2 shrink-0">
          <div className="relative flex items-center rounded-xl bg-subtle border border-subtle focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai:chat.inputPlaceholder')}
              rows={1}
              className="w-full resize-none bg-transparent px-3 py-2.5 text-xs text-primary placeholder:text-tertiary focus:outline-none max-h-28"
            />
            <button
              onClick={() => handleSend(inputValue)}
              disabled={!inputValue.trim() || isLoading}
              className="mr-1.5 p-2 rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              title={t('ai:chat.send')}
              aria-label={t('ai:chat.send')}
            >
              <Send size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-1 text-[10px] text-tertiary">
            <AlertCircle size={11} className="shrink-0" />
            <span className="truncate">{t('ai:chat.disclaimer')}</span>
          </div>
        </div>
      </aside>
    </>
  );
};

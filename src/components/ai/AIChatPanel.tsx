import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Settings,
  AlertCircle,
  Pencil,
  Paperclip,
  Info,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { aiService } from '../../services/ai/aiService';
import { aiSettingsService } from '../../services/ai/aiSettingsService';
import {
  getModelCapabilities,
  type ModelCapabilities,
} from '../../services/ai/modelCapabilities';
import { AttachmentError, prepareAttachment } from '../../services/ai/attachmentService';
import type { AIProviderType, ChatAttachment, ChatMessage } from '../../services/ai/types';
import type { ResizableSeparatorProps } from '../../hooks/useResizablePane';
import { AIActionApprovalCard } from './AIActionApprovalCard';
import { AIMarkdownRenderer } from './AIMarkdownRenderer';
import { AppThinkingOrb } from '../ui/AppThinkingOrb';

export interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  isResizing?: boolean;
  isExpandedPreset?: boolean;
  onToggleWidthPreset?: () => void;
  resizeHandleProps?: ResizableSeparatorProps;
}

const CLOUD_PROVIDERS: ReadonlySet<AIProviderType> = new Set([
  'openai',
  'anthropic',
  'gemini',
  'groq',
  'openrouter',
]);

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentIcon: React.FC<{ kind: ChatAttachment['kind'] }> = ({ kind }) => {
  if (kind === 'image') return <ImageIcon size={13} className="shrink-0 text-primary" />;
  if (kind === 'xlsx' || kind === 'csv') return <FileSpreadsheet size={13} className="shrink-0 text-positive" />;
  return <FileText size={13} className="shrink-0 text-warning" />;
};

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  isOpen,
  onClose,
  width = 420,
  isResizing = false,
  isExpandedPreset = false,
  onToggleWidthPreset,
  resizeHandleProps,
}) => {
  const panelRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOllamaColdStart, setIsOllamaColdStart] = useState(false);
  const [isLongLoading, setIsLongLoading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [cloudConsentedProviders, setCloudConsentedProviders] = useState<Record<string, boolean>>({});

  const settings = aiSettingsService.getSettings();
  const isCloud = CLOUD_PROVIDERS.has(settings.activeProvider);
  const needsCloudConsent =
    isCloud &&
    pendingAttachments.length > 0 &&
    !cloudConsentedProviders[settings.activeProvider];

  // Close with Escape only when focus is inside the panel (never traps focus on the rest of the page)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active && panelRef.current?.contains(active)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getModelCapabilities(settings)
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    settings.activeProvider,
    settings.ollamaEndpoint,
    settings.ollamaModel,
    settings.cloudModel,
  ]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isCancelled = false;

    if (isLoading) {
      if (settings.activeProvider === 'ollama') {
        aiSettingsService
          .checkOllamaModelLoaded(settings.ollamaEndpoint, settings.ollamaModel)
          .then((isLoaded) => {
            if (isCancelled) return;
            setIsOllamaColdStart(!isLoaded);

            if (!isLoaded) {
              pollInterval = setInterval(() => {
                aiSettingsService
                  .checkOllamaModelLoaded(settings.ollamaEndpoint, settings.ollamaModel)
                  .then((nowLoaded) => {
                    if (isCancelled) return;
                    if (nowLoaded) {
                      setIsOllamaColdStart(false);
                      if (pollInterval) clearInterval(pollInterval);
                    }
                  })
                  .catch(() => {});
              }, 1500);
            }
          })
          .catch(() => {
            if (!isCancelled) setIsOllamaColdStart(false);
          });

        timer = setTimeout(() => {
          if (!isCancelled) setIsLongLoading(true);
        }, 3500);
      } else {
        setIsOllamaColdStart(false);
        timer = setTimeout(() => {
          if (!isCancelled) setIsLongLoading(true);
        }, 3000);
      }
    } else {
      setIsOllamaColdStart(false);
      setIsLongLoading(false);
    }

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isLoading, settings.activeProvider, settings.ollamaEndpoint, settings.ollamaModel]);

  useEffect(() => {
    setMessages(aiService.getMessages());
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setAttachmentError(null);
      setIsPreparingFiles(true);

      try {
        const caps = capabilities ?? (await getModelCapabilities(settings));
        setCapabilities(caps);
        const prepared: ChatAttachment[] = [];

        for (const file of list) {
          try {
            const att = await prepareAttachment(file, caps);
            prepared.push(att);
          } catch (err) {
            if (err instanceof AttachmentError) {
              setAttachmentError(
                t(err.reasonKey ?? 'ai:attachments.errors.corruptFile', {
                  model: caps.model || settings.activeProvider,
                  file: file.name,
                })
              );
            } else {
              setAttachmentError(t('ai:attachments.errors.corruptFile'));
            }
          }
        }

        if (prepared.length > 0) {
          setPendingAttachments((prev) => [...prev, ...prepared]);
        }
      } finally {
        setIsPreparingFiles(false);
      }
    },
    [capabilities, settings, t]
  );

  const handleSend = async (content: string) => {
    const text = content.trim();
    const attachmentsToSend = [...pendingAttachments];
    if ((!text && attachmentsToSend.length === 0) || isLoading || isPreparingFiles || needsCloudConsent) {
      return;
    }

    const promptText =
      text ||
      (attachmentsToSend.length > 0 ? t('ai:attachments.defaultPrompt') : '');

    setInputValue('');
    setPendingAttachments([]);
    setAttachmentError(null);
    setOpenInfoId(null);
    setIsLoading(true);

    aiService.addUserMessage(promptText, attachmentsToSend);
    setMessages([...aiService.getMessages()]);

    try {
      const updated = await aiService.processAssistantTurn({
        language: i18n.language === 'en' ? 'en' : 'fr',
        currency: 'EUR',
      });
      setMessages([...updated]);
    } catch (err) {
      console.error('[AIChatPanel] Error processing assistant turn:', err);
      setMessages([...aiService.getMessages()]);
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
    } catch (err) {
      console.error('[AIChatPanel] Error during edit regeneration:', err);
      setMessages([...aiService.getMessages()]);
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const handleClearHistory = () => {
    aiService.clearMessages();
    setMessages([]);
    setPendingAttachments([]);
    setAttachmentError(null);
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
    aiService.rejectAction(actionId, { language: i18n.language === 'en' ? 'en' : 'fr' });
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

  const providerDisplayName = t(`ai:settings.providers.${settings.activeProvider}.name`);

  const renderPreprocessDescription = (att: ChatAttachment): string => {
    if (!att.preprocessing) return '';
    const details = att.preprocessing.details || {};
    return t(`ai:attachments.preprocess.${att.preprocessing.method}`, {
      sheet: String(details.sheet ?? ''),
      rows: Number(details.rows ?? 0),
      pages: Number(details.pages ?? 0),
      renderedPages: Number(details.renderedPages ?? 0),
      width: Number(details.width ?? 0),
      height: Number(details.height ?? 0),
    });
  };

  const renderAttachmentChip = (
    att: ChatAttachment,
    chipKey: string,
    removable: boolean
  ) => {
    const isInfoOpen = openInfoId === chipKey;
    return (
      <div key={chipKey} className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subtle border border-subtle text-[11px] text-primary max-w-full">
        <AttachmentIcon kind={att.kind} />
        <span className="truncate max-w-[140px] font-medium">{att.name}</span>
        <span className="text-[10px] text-tertiary shrink-0">{formatFileSize(att.sizeBytes)}</span>

        {att.preprocessing && (
          <button
            type="button"
            onClick={() => setOpenInfoId(isInfoOpen ? null : chipKey)}
            className="p-0.5 rounded text-brand hover:bg-primary/10 transition-colors shrink-0"
            title={renderPreprocessDescription(att)}
            aria-label={t('ai:attachments.preprocess.infoLabel')}
            aria-expanded={isInfoOpen}
            data-testid={`preprocess-info-${chipKey}`}
          >
            <Info size={13} />
          </button>
        )}

        {removable && (
          <button
            type="button"
            onClick={() => {
              setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id));
              if (isInfoOpen) setOpenInfoId(null);
            }}
            className="p-0.5 rounded text-tertiary hover:text-error transition-colors shrink-0"
            aria-label={t('ai:attachments.remove', { name: att.name })}
            title={t('ai:attachments.remove', { name: att.name })}
          >
            <X size={12} />
          </button>
        )}

        {att.preprocessing && isInfoOpen && (
          <div
            role="note"
            className="absolute bottom-full left-0 mb-1.5 w-64 p-2.5 rounded-xl bg-card border border-subtle shadow-xl text-[11px] text-secondary z-40 leading-relaxed"
          >
            <div className="font-semibold text-primary mb-0.5">
              {t('ai:attachments.preprocess.badge')}
            </div>
            <p>{renderPreprocessDescription(att)}</p>
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={t('ai:drawer.title')}
      data-testid="ai-chat-panel"
      style={{ '--gf-ai-panel-w': `${width}px` } as React.CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer?.files?.length) {
          void addFiles(e.dataTransfer.files);
        }
      }}
      className={`fixed inset-0 lg:inset-auto lg:top-16 lg:right-0 lg:bottom-0 w-full lg:w-[var(--gf-ai-panel-w)] bg-card lg:border-l border-subtle z-50 lg:z-30 flex flex-col shadow-xl ${
        isResizing ? 'transition-none' : 'transition-[width] duration-200'
      }`}
    >
      {/* Left-edge continuous drag handle (lg+ only) */}
      {resizeHandleProps && (
        <div
          {...resizeHandleProps}
          data-testid="ai-panel-resize-handle"
          aria-label={t('ai:panel.resizeHandle')}
          title={t('ai:panel.resizeHandle')}
          className="hidden lg:flex items-center justify-center absolute inset-y-0 -left-1.5 w-3 cursor-col-resize z-40 group focus:outline-none"
        >
          <span
            className={`h-full w-0.5 transition-colors ${
              isResizing
                ? 'bg-primary'
                : 'bg-transparent group-hover:bg-primary/60 group-focus:bg-primary'
            }`}
          />
        </div>
      )}

      {/* Drag-and-drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Paperclip size={24} className="text-primary" />
          <p className="text-xs font-semibold text-primary">{t('ai:attachments.dropHere')}</p>
          <p className="text-[11px] text-secondary">{t('ai:attachments.dropHint')}</p>
        </div>
      )}

      {/* Header */}
      <div className="h-14 px-4 border-b border-subtle flex items-center justify-between bg-card/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-primary truncate">{t('ai:drawer.title')}</h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-subtle border border-subtle text-secondary shrink-0">
                {providerBadgeLabel()}
              </span>
            </div>
            <p className="text-[11px] text-tertiary truncate">{t('ai:drawer.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onToggleWidthPreset && (
            <button
              type="button"
              onClick={onToggleWidthPreset}
              className="hidden lg:inline-flex p-2 text-secondary hover:text-primary hover:bg-subtle rounded-lg transition-colors"
              title={isExpandedPreset ? t('ai:panel.compact') : t('ai:panel.expand')}
              aria-label={isExpandedPreset ? t('ai:panel.compact') : t('ai:panel.expand')}
            >
              {isExpandedPreset ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          <Link
            to="/settings?tab=ai"
            className="p-2 text-secondary hover:text-primary hover:bg-subtle rounded-lg transition-colors"
            title={t('ai:drawer.openSettings')}
            aria-label={t('ai:drawer.openSettings')}
          >
            <Settings size={17} />
          </Link>
          <button
            type="button"
            onClick={handleClearHistory}
            className="p-2 text-secondary hover:text-error hover:bg-subtle rounded-lg transition-colors"
            title={t('ai:drawer.clearHistory')}
            aria-label={t('ai:drawer.clearHistory')}
          >
            <Trash2 size={17} />
          </button>
          <button
            type="button"
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
          <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-5">
            <div className="flex items-center justify-center p-2 rounded-2xl bg-subtle/50 border border-subtle">
              <AppThinkingOrb state="breathing" size={56} label={t('ai:drawer.title')} />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-sm font-semibold text-primary">{t('ai:drawer.title')}</h3>
              <p className="text-xs text-secondary leading-relaxed">
                {t('ai:drawer.emptyConversation')}
              </p>
            </div>

            {/* Quick suggestions chips */}
            <div className="w-full space-y-2 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-left p-2.5 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/25 text-xs font-semibold text-primary transition-all flex items-center justify-between"
              >
                <span>{t('ai:chips.importStatement')}</span>
                <span className="text-primary">→</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend(t('ai:chips.portfolioSummaryPrompt'))}
                className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
              >
                <span>{t('ai:chips.portfolioSummary')}</span>
                <span className="text-tertiary">→</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend(t('ai:chips.assetAllocationPrompt'))}
                className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
              >
                <span>{t('ai:chips.assetAllocation')}</span>
                <span className="text-tertiary">→</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend(t('ai:chips.taxOptimizationPrompt'))}
                className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
              >
                <span>{t('ai:chips.taxOptimization')}</span>
                <span className="text-tertiary">→</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend(t('ai:chips.goalsProgressPrompt'))}
                className="w-full text-left p-2.5 rounded-xl bg-subtle/70 hover:bg-subtle border border-subtle/80 hover:border-primary/30 text-xs font-medium text-primary transition-all flex items-center justify-between"
              >
                <span>{t('ai:chips.goalsProgress')}</span>
                <span className="text-tertiary">→</span>
              </button>
              <button
                type="button"
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
              if (msg.role === 'tool') return null;
              if (msg.role === 'assistant' && !msg.content?.trim() && !msg.pendingAction) return null;

              const isUser = msg.role === 'user';
              const isEditingThis = editingMessageId === msg.id;

              if (isUser) {
                return (
                  <div key={msg.id} className="flex flex-col items-end space-y-1.5">
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1.5 max-w-[90%]">
                        {msg.attachments.map((att) =>
                          renderAttachmentChip(att, `${msg.id}-${att.id}`, false)
                        )}
                      </div>
                    )}
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

            {isLoading && (
              <div className="flex flex-col space-y-1.5 p-3 rounded-2xl bg-subtle border border-subtle text-xs max-w-[85%] animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <AppThinkingOrb
                    state={
                      settings.activeProvider === 'ollama' && isOllamaColdStart
                        ? 'connecting'
                        : isLongLoading
                        ? 'solving'
                        : 'working'
                    }
                    size={20}
                    label={
                      settings.activeProvider === 'ollama' && isOllamaColdStart
                        ? t('ai:chat.ollamaModelColdStart', { model: settings.ollamaModel })
                        : t('ai:chat.generatingResponse')
                    }
                  />
                  <span className="font-semibold text-primary">
                    {settings.activeProvider === 'ollama' && isOllamaColdStart
                      ? t('ai:chat.ollamaModelColdStart', { model: settings.ollamaModel })
                      : t('ai:chat.generatingResponse')}
                  </span>
                </div>
                {settings.activeProvider === 'ollama' && isOllamaColdStart && (
                  <p className="text-[11px] text-tertiary pl-7 leading-relaxed">
                    {t('ai:chat.ollamaLoadingVram')}
                  </p>
                )}
                {!isOllamaColdStart && isLongLoading && (
                  <p className="text-[11px] text-tertiary pl-7 leading-relaxed">
                    {t('ai:chat.generatingDetail')}
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
        {attachmentError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-negative-subtle border border-negative/30 text-[11px] text-negative"
          >
            <div className="flex items-start gap-1.5">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{attachmentError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachmentError(null)}
              className="p-0.5 hover:opacity-75 shrink-0"
              aria-label={t('common:buttons.close')}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {needsCloudConsent && (
          <div
            role="region"
            aria-label={t('ai:attachments.cloudNotice.title')}
            className="p-2.5 rounded-xl bg-warning-subtle border border-warning/30 text-[11px] text-primary space-y-1.5"
          >
            <div className="flex items-start gap-1.5">
              <ShieldAlert size={14} className="text-warning shrink-0 mt-0.5" />
              <span>
                {t('ai:attachments.cloudNotice.body', { provider: providerDisplayName })}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setCloudConsentedProviders((prev) => ({
                  ...prev,
                  [settings.activeProvider]: true,
                }))
              }
              className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-semibold hover:opacity-90 transition-opacity"
            >
              {t('ai:attachments.cloudNotice.confirm')}
            </button>
          </div>
        )}

        {(pendingAttachments.length > 0 || isPreparingFiles) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingAttachments.map((att) =>
              renderAttachmentChip(att, `pending-${att.id}`, true)
            )}
            {isPreparingFiles && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subtle border border-subtle text-[11px] text-secondary">
                <Loader2 size={12} className="animate-spin" />
                <span>{t('ai:attachments.preparing')}</span>
              </span>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.xlsx,.pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          data-testid="ai-attachment-input"
          onChange={(e) => {
            if (e.target.files?.length) {
              void addFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />

        <div className="relative flex items-center rounded-xl bg-subtle border border-subtle focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isPreparingFiles}
            className="ml-1.5 p-2 rounded-lg text-secondary hover:text-primary hover:bg-card transition-colors disabled:opacity-40"
            title={t('ai:attachments.attachButton')}
            aria-label={t('ai:attachments.attachButton')}
            data-testid="ai-attach-button"
          >
            <Paperclip size={15} />
          </button>

          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t('ai:chat.inputPlaceholder')}
            rows={1}
            className="w-full resize-none bg-transparent px-2.5 py-2.5 text-xs text-primary placeholder:text-tertiary focus:outline-none max-h-28"
          />

          <button
            type="button"
            onClick={() => handleSend(inputValue)}
            disabled={
              (!inputValue.trim() && pendingAttachments.length === 0) ||
              isLoading ||
              isPreparingFiles ||
              needsCloudConsent
            }
            className="mr-1.5 p-2 rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            title={t('ai:chat.send')}
            aria-label={t('ai:chat.send')}
          >
            <Send size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-tertiary">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle size={11} className="shrink-0" />
            <span className="truncate">{t('ai:chat.disclaimer')}</span>
          </div>
          <span className="shrink-0 hidden sm:inline">{t('ai:attachments.supportedFormats')}</span>
        </div>
      </div>
    </aside>
  );
};

import visionConfig from '../../config/aiVisionModels.json';
import { appStorage } from '../storage/appStorage';
import type { AIProviderType, AISettings, AttachmentKind, AttachmentPreprocessMethod } from './types';

export type PdfDeliveryMode =
  | 'native_document'
  | 'native_file'
  | 'native_image_url'
  | 'local_preprocess'
  | 'unsupported';

export interface ModelCapabilities {
  provider: AIProviderType;
  model: string;
  vision: boolean;
  nativePdf: boolean;
  pdfMode: PdfDeliveryMode;
  openRouterPdfPlugin: boolean;
  maxImageBytes: number;
  maxPdfBytes: number;
  maxImages: number;
  probed: boolean;
}

export interface AttachmentAllowance {
  ok: boolean;
  willPreprocess: boolean;
  preprocessMethod?: AttachmentPreprocessMethod;
  reasonKey?: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const OPENROUTER_CACHE_KEY = 'gf_ai_openrouter_models_cache';
const OPENROUTER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface OpenRouterCachedEntry {
  vision: boolean;
  nativeFile: boolean;
}

interface OpenRouterCachePayload {
  fetchedAt: number;
  models: Record<string, OpenRouterCachedEntry>;
}

const ollamaCache = new Map<string, ModelCapabilities>();
let openRouterCacheMemory: OpenRouterCachePayload | null = null;

export function clearModelCapabilitiesCache(): void {
  ollamaCache.clear();
  openRouterCacheMemory = null;
}

const matchesPrefix = (model: string, prefixes: readonly string[]): boolean => {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  // Strip OpenRouter/provider namespace prefix if passed (e.g. "openai/gpt-4o" -> "gpt-4o")
  const bare = normalized.includes('/') ? normalized.split('/').pop() || normalized : normalized;
  return prefixes.some((p) => {
    const prefix = p.toLowerCase();
    return normalized.startsWith(prefix) || bare.startsWith(prefix);
  });
};

const matchesAnyPattern = (value: string, patterns: readonly string[]): boolean => {
  const lower = value.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
};

async function probeOllamaCapabilities(endpoint: string, model: string): Promise<ModelCapabilities> {
  const cleanUrl = (endpoint || 'http://localhost:11434').replace(/\/+$/, '');
  const trimmedModel = model.trim();
  const cacheKey = `${cleanUrl}|${trimmedModel}`;
  const cached = ollamaCache.get(cacheKey);
  if (cached) return cached;

  let vision = matchesAnyPattern(trimmedModel, visionConfig.ollamaFallbackVisionPatterns);
  let probed = false;

  if (trimmedModel) {
    try {
      const response = await fetch(`${cleanUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: trimmedModel }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          capabilities?: unknown;
          details?: { family?: string; families?: string[] };
        };
        if (Array.isArray(data?.capabilities)) {
          vision = data.capabilities.includes('vision');
          probed = true;
        } else if (Array.isArray(data?.details?.families)) {
          vision = data.details.families.some((fam) =>
            matchesAnyPattern(String(fam), visionConfig.ollamaFallbackVisionPatterns)
          );
          probed = true;
        }
      }
    } catch {
      // Ollama offline or unreachable: keep name-pattern heuristic and avoid poisoning cache
      return {
        provider: 'ollama',
        model: trimmedModel,
        vision,
        nativePdf: false,
        pdfMode: 'local_preprocess',
        openRouterPdfPlugin: false,
        maxImageBytes: DEFAULT_MAX_BYTES,
        maxPdfBytes: DEFAULT_MAX_BYTES,
        maxImages: 5,
        probed: false,
      };
    }
  }

  const caps: ModelCapabilities = {
    provider: 'ollama',
    model: trimmedModel,
    vision,
    nativePdf: false,
    pdfMode: 'local_preprocess',
    openRouterPdfPlugin: false,
    maxImageBytes: DEFAULT_MAX_BYTES,
    maxPdfBytes: DEFAULT_MAX_BYTES,
    maxImages: 5,
    probed,
  };
  if (probed) ollamaCache.set(cacheKey, caps);
  return caps;
}

function readOpenRouterStorageCache(): OpenRouterCachePayload | null {
  if (openRouterCacheMemory && Date.now() - openRouterCacheMemory.fetchedAt < OPENROUTER_CACHE_TTL_MS) {
    return openRouterCacheMemory;
  }
  try {
    const raw = appStorage.getItem(OPENROUTER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpenRouterCachePayload;
    if (parsed && typeof parsed.fetchedAt === 'number' && parsed.models && Date.now() - parsed.fetchedAt < OPENROUTER_CACHE_TTL_MS) {
      openRouterCacheMemory = parsed;
      return parsed;
    }
  } catch {
    // Ignore malformed cache
  }
  return null;
}

async function probeOpenRouterCapabilities(model: string): Promise<ModelCapabilities> {
  const trimmedModel = model.trim();
  let cache = readOpenRouterStorageCache();
  let probed = Boolean(cache);

  if (!cache) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', { method: 'GET' });
      if (response.ok) {
        const data = (await response.json()) as {
          data?: Array<{
            id?: string;
            architecture?: { input_modalities?: string[] };
          }>;
        };
        const models: Record<string, OpenRouterCachedEntry> = {};
        if (Array.isArray(data?.data)) {
          for (const entry of data.data) {
            if (!entry?.id) continue;
            const modalities = Array.isArray(entry.architecture?.input_modalities)
              ? entry.architecture.input_modalities
              : [];
            models[entry.id] = {
              vision: modalities.includes('image'),
              nativeFile: modalities.includes('file'),
            };
          }
        }
        cache = { fetchedAt: Date.now(), models };
        openRouterCacheMemory = cache;
        probed = true;
        try {
          appStorage.setItem(OPENROUTER_CACHE_KEY, JSON.stringify(cache));
        } catch {
          // Ignore storage quota errors
        }
      }
    } catch {
      probed = false;
    }
  }

  const matched = cache?.models?.[trimmedModel];
  const vision = matched ? matched.vision : true;
  const hasNativeFile = matched ? matched.nativeFile : false;

  return {
    provider: 'openrouter',
    model: trimmedModel,
    vision,
    nativePdf: true,
    pdfMode: 'native_file',
    // OpenRouter free pdf-text plugin handles models without native file ingestion
    openRouterPdfPlugin: !hasNativeFile,
    maxImageBytes: DEFAULT_MAX_BYTES,
    maxPdfBytes: DEFAULT_MAX_BYTES,
    maxImages: 10,
    probed: Boolean(matched && probed),
  };
}

/**
 * Resolve attachment and vision capabilities for the currently active AI provider and model.
 */
export async function getModelCapabilities(settings: AISettings): Promise<ModelCapabilities> {
  const provider = settings.activeProvider;
  const cloudModel = (settings.cloudModel || '').trim();

  switch (provider) {
    case 'anthropic':
      return {
        provider,
        model: cloudModel,
        vision: true,
        nativePdf: true,
        pdfMode: 'native_document',
        openRouterPdfPlugin: false,
        maxImageBytes: DEFAULT_MAX_BYTES,
        maxPdfBytes: DEFAULT_MAX_BYTES,
        maxImages: 20,
        probed: true,
      };

    case 'gemini':
      // Google Gemini's OpenAI-compatible endpoint natively ingests PDFs via image_url data URIs
      return {
        provider,
        model: cloudModel,
        vision: true,
        nativePdf: true,
        pdfMode: 'native_image_url',
        openRouterPdfPlugin: false,
        maxImageBytes: DEFAULT_MAX_BYTES,
        maxPdfBytes: DEFAULT_MAX_BYTES,
        maxImages: 10,
        probed: true,
      };

    case 'openai': {
      const vision = cloudModel === '' ? true : matchesPrefix(cloudModel, visionConfig.openai.visionPrefixes);
      const nativePdf =
        cloudModel === ''
          ? true
          : matchesPrefix(cloudModel, visionConfig.openai.nativePdfPrefixes) &&
            !matchesPrefix(cloudModel, visionConfig.openai.nativePdfExcludedPrefixes);
      return {
        provider,
        model: cloudModel,
        vision,
        nativePdf,
        pdfMode: nativePdf ? 'native_file' : 'local_preprocess',
        openRouterPdfPlugin: false,
        maxImageBytes: visionConfig.openai.maxImageBytes,
        maxPdfBytes: visionConfig.openai.maxPdfBytes,
        maxImages: visionConfig.openai.maxImages,
        probed: cloudModel !== '',
      };
    }

    case 'groq': {
      const vision = matchesPrefix(cloudModel, visionConfig.groq.visionPrefixes);
      return {
        provider,
        model: cloudModel,
        vision,
        nativePdf: false,
        pdfMode: 'local_preprocess',
        openRouterPdfPlugin: false,
        maxImageBytes: visionConfig.groq.maxImageBytes,
        maxPdfBytes: DEFAULT_MAX_BYTES,
        maxImages: visionConfig.groq.maxImages,
        probed: cloudModel !== '',
      };
    }

    case 'openrouter':
      return probeOpenRouterCapabilities(cloudModel);

    case 'ollama':
      return probeOllamaCapabilities(settings.ollamaEndpoint, settings.ollamaModel);

    case 'mock':
    default:
      return {
        provider: 'mock',
        model: 'mock',
        vision: false,
        nativePdf: false,
        pdfMode: 'unsupported',
        openRouterPdfPlugin: false,
        maxImageBytes: DEFAULT_MAX_BYTES,
        maxPdfBytes: DEFAULT_MAX_BYTES,
        maxImages: 0,
        probed: true,
      };
  }
}

/**
 * Single source of truth for whether a file kind can be attached for the active model,
 * and whether local preprocessing will run beforehand (surfaced via the UI (i) badge).
 */
export function canAttach(kind: AttachmentKind, caps: ModelCapabilities): AttachmentAllowance {
  if (kind === 'csv') {
    return { ok: true, willPreprocess: false };
  }

  if (kind === 'xlsx') {
    return { ok: true, willPreprocess: true, preprocessMethod: 'xlsx_to_csv' };
  }

  if (kind === 'image') {
    if (caps.vision) {
      return { ok: true, willPreprocess: false };
    }
    return {
      ok: false,
      willPreprocess: false,
      reasonKey: caps.provider === 'mock' ? 'ai:attachments.errors.demoUnsupported' : 'ai:attachments.errors.noVision',
    };
  }

  // kind === 'pdf'
  if (caps.nativePdf) {
    return { ok: true, willPreprocess: false };
  }
  if (caps.pdfMode === 'local_preprocess') {
    return { ok: true, willPreprocess: true, preprocessMethod: 'pdf_text' };
  }
  return {
    ok: false,
    willPreprocess: false,
    reasonKey: 'ai:attachments.errors.demoUnsupported',
  };
}

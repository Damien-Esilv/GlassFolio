/**
 * Root types barrel file (GlassFolio)
 * Re-exports unified domain interfaces from src/types/domain.ts
 * for 100% backward compatibility with all root-relative imports.
 */

export * from './src/types/domain';
export type { AssetClass } from './src/constants/assetClasses';
export type { FiscalProfile } from './src/types/types.backend';
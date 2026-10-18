#!/usr/bin/env sh
# ==============================================================================
# GlassFolio — Pre-Commit Security Shield Hook
# ==============================================================================
if [ -f "scripts/pre-commit-check.mjs" ]; then
  node scripts/pre-commit-check.mjs
fi

# CSV Import Refactoring Plan

## Status: IN PROGRESS
**Created:** 2026-02-08
**Objective:** Dynamic CSV parsing, visual mapping feedback, and UI/UX consistency fixes

---

## Phase 1: Dynamic CSV Preview ✅
**Goal:** Display ALL columns from uploaded CSV dynamically

### Changes:
1. ✅ Update `Step3Mapping` preview table to render all headers dynamically
2. ✅ Remove hardcoded column list (Date, Type, Asset, Amount, Price, Qty, Description)
3. ✅ Ensure responsive table with horizontal scroll for many columns

### Files Modified:
- `pages/ImportWizard.tsx` (Step3Mapping component)

---

## Phase 2: Visual Mapping Interface 🔄
**Goal:** Add header token tags showing mapping status at a glance

### Changes:
1. 🔄 Create `HeaderTokenBadge` component
2. 🔄 Add `HeaderTokensPanel` above mapping dropdowns
3. 🔄 Implement color logic:
   - **Green**: Header is mapped to a database field
   - **Red**: Header is not mapped or explicitly skipped
4. 🔄 Add visual feedback on dropdown changes

### Files Modified:
- `pages/ImportWizard.tsx` (new components + Step3Mapping)

---

## Phase 3: UI/UX Consistency Fixes 🔄
**Goal:** Strict adherence to `AI_CODING_STANDARDS.md`

### Issues Found:
| Line | Component | Issue | Fix |
|------|-----------|-------|-----|
| 250 | Step1ContextSelection | `bg-slate-800 text-white` on input | Use `bg-subtle text-primary` |
| 256 | Step1ContextSelection | `bg-slate-800 text-white` on select | Use `bg-subtle text-primary` |
| 320 | Step1ContextSelection | `bg-slate-800 text-white` on input | Use `bg-subtle text-primary` |
| 327 | Step1ContextSelection | `bg-slate-800 text-white` on select | Use `bg-subtle text-primary` |
| 339 | Step1ContextSelection | `bg-slate-800 text-white` on select | Use `bg-subtle text-primary` |
| 553 | Step3Mapping | `bg-slate-800 text-white` on input | Use `bg-subtle text-primary` |
| 574-577 | Step3Mapping | Dropdown uses `bg-slate-50 dark:bg-slate-800` | Use `bg-subtle text-primary` |
| 753, 769, 784 | StagingRow | Edit inputs use hardcoded colors | Use `bg-subtle text-primary` |

### Files Modified:
- `pages/ImportWizard.tsx` (all form elements)

---

## Phase 4: Code Quality & Standards 🔄
**Goal:** Clean architecture and future-proofing

### Tasks:
1. 🔄 Add i18n support (currently all text is hardcoded)
2. 🔄 Ensure strict TypeScript (no `any` types)
3. 🔄 Add proper error boundaries
4. 🔄 Verify accessibility (aria-labels on icon buttons)

---

## Testing Checklist
- [ ] Upload CSV with 3 columns → Preview shows 3 columns
- [ ] Upload CSV with 15 columns → Preview shows all 15 columns
- [ ] Header tokens turn green when mapped
- [ ] Header tokens stay red when unmapped
- [ ] Light mode: No white text on white background
- [ ] Light mode: Dropdowns are readable
- [ ] Dark mode: All elements visible
- [ ] Midnight mode: Proper contrast
- [ ] Mapping persists when switching between steps

---

## Success Criteria
✅ CSV preview dynamically displays N columns (not hardcoded to 5)
✅ Visual header token feedback (green/red badges)
✅ Zero hardcoded colors in form elements
✅ Light mode fully functional
✅ All three themes work correctly
✅ No regression in existing import functionality

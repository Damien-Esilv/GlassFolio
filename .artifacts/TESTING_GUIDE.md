# Import Refactoring - Testing Guide

## Overview
This guide will help you verify all the changes made to the CSV import workflow.

---

## Test Files Provided

### 1. `test-import-3-columns.csv`
**Purpose:** Test minimal CSV with only 3 columns
**Columns:** Date, Asset, Amount
**Expected Behavior:**
- Preview table should show exactly 3 columns
- Header tokens panel should show 3 badges
- All 3 headers should turn GREEN when mapped

### 2. `test-import-13-columns.csv`
**Purpose:** Test CSV with many columns
**Columns:** Date, Time, Symbol, ISIN, Quantity, Price, Fee, Total, Currency, Type, Description, Reference, Balance (13 total)
**Expected Behavior:**
- Preview table should show all 13 columns with horizontal scroll
- Header tokens panel should show 13 badges
- Unmapped columns should remain RED

---

## Testing Checklist

### Phase 1: Dynamic CSV Preview

#### Test 1.1: Upload 3-Column CSV
1. Navigate to Import Wizard
2. Select Institution & Account
3. Choose "Transaction History" mode
4. Upload `test-import-3-columns.csv`
5. **Verify:**
   - [ ] Preview table shows exactly 3 columns: Date, Asset, Amount
   - [ ] Preview title shows "Preview (First 5 Rows × 3 Columns)"
   - [ ] No horizontal scroll needed
   - [ ] All data is visible

#### Test 1.2: Upload 13-Column CSV
1. Reset wizard (or start new import)
2. Upload `test-import-13-columns.csv`
3. **Verify:**
   - [ ] Preview table shows all 13 columns
   - [ ] Preview title shows "Preview (First 10 Rows × 13 Columns)"
   - [ ] Horizontal scroll appears
   - [ ] All column headers are visible
   - [ ] All data cells are visible

---

### Phase 2: Visual Mapping Feedback

#### Test 2.1: Initial State (Unmapped)
1. Upload any CSV file
2. Look at the "CSV Headers (Mapping Status)" panel
3. **Verify:**
   - [ ] Panel appears above the mapping dropdowns
   - [ ] All headers show as RED badges initially (if no auto-detection)
   - [ ] Legend shows: Green = Mapped, Red = Not Mapped

#### Test 2.2: Auto-Detection
1. Upload `test-import-13-columns.csv`
2. **Verify:**
   - [ ] Some headers auto-map (e.g., "Date" → transactionDate)
   - [ ] Auto-mapped headers turn GREEN immediately
   - [ ] Unmapped headers remain RED
   - [ ] Green banner shows "Detected format: ..."

#### Test 2.3: Manual Mapping
1. Upload `test-import-3-columns.csv`
2. Manually map:
   - Date → Transaction Date
   - Asset → Asset Symbol
   - Amount → Amount
3. **Verify:**
   - [ ] Each header turns GREEN as you map it
   - [ ] Color changes happen immediately (no page refresh)
   - [ ] All 3 badges are GREEN when all mapped

#### Test 2.4: Unmapping
1. With a mapped field, select "— Not mapped —" from dropdown
2. **Verify:**
   - [ ] Corresponding header badge turns RED
   - [ ] Change is immediate

---

### Phase 3: Light Mode Compatibility

#### Test 3.1: Step 1 - Context Selection (Light Mode)
1. Switch to Light Mode in Settings
2. Navigate to Import Wizard
3. Click "New" to create a new institution
4. **Verify:**
   - [ ] Institution name input: Text is dark, background is light
   - [ ] Institution type dropdown: Text is dark, background is light
   - [ ] No white text on white background
   - [ ] All text is readable

5. Create account (click "+ Create new account")
6. **Verify:**
   - [ ] Account name input: Readable
   - [ ] Account type dropdown: Readable
   - [ ] Currency dropdown: Readable

#### Test 3.2: Step 3 - Mapping (Light Mode)
1. Upload a CSV file
2. Click "Save as template"
3. **Verify:**
   - [ ] Template name input: Dark text on light background
   - [ ] Input is readable

4. Check mapping dropdowns
5. **Verify:**
   - [ ] All dropdowns have dark text on light background
   - [ ] Options are readable when dropdown is open
   - [ ] No contrast issues

#### Test 3.3: Step 4 - Staging (Light Mode)
1. Proceed to staging area
2. Find a row with errors
3. Click edit icon
4. **Verify:**
   - [ ] Date input: Readable
   - [ ] Asset input: Readable
   - [ ] Amount input: Readable
   - [ ] No white text on white background

---

### Phase 4: Dark Mode Compatibility

#### Test 4.1: All Steps (Dark Mode)
1. Switch to Dark Mode
2. Repeat all tests from Phase 3
3. **Verify:**
   - [ ] All form elements visible
   - [ ] Proper contrast maintained
   - [ ] No regression from previous behavior

---

### Phase 5: Midnight Mode Compatibility

#### Test 5.1: All Steps (Midnight Mode)
1. Switch to Midnight Mode (data-theme="night")
2. Repeat all tests from Phase 3
3. **Verify:**
   - [ ] Deep theme works correctly
   - [ ] Proper contrast throughout
   - [ ] All elements visible

---

### Phase 6: End-to-End Import Flow

#### Test 6.1: Complete Import (3 Columns)
1. Upload `test-import-3-columns.csv`
2. Map all 3 fields:
   - Date → Transaction Date
   - Asset → Asset Symbol
   - Amount → Amount
3. Click "Analyze Data"
4. **Verify:**
   - [ ] Staging area shows parsed transactions
   - [ ] No errors (assuming valid data)
5. Click "Import X Transactions"
6. **Verify:**
   - [ ] Import completes successfully
   - [ ] Success screen shows correct count

#### Test 6.2: Complete Import (13 Columns)
1. Upload `test-import-13-columns.csv`
2. Map required fields (Date, Symbol, Amount)
3. Optionally map other fields (ISIN, Quantity, Price, Fee, etc.)
4. **Verify:**
   - [ ] Only mapped columns turn GREEN
   - [ ] Unmapped optional columns stay RED
   - [ ] Preview shows all 13 columns
5. Proceed with import
6. **Verify:**
   - [ ] Import succeeds
   - [ ] Only mapped data is imported

---

## Regression Testing

### Test R.1: Existing Functionality
1. Test snapshot import mode
2. **Verify:**
   - [ ] Snapshot wizard still works
   - [ ] No UI issues

### Test R.2: Template Saving
1. Create a mapping
2. Save as template
3. **Verify:**
   - [ ] Template saves successfully
   - [ ] Template can be reloaded

### Test R.3: Error Handling
1. Upload invalid CSV
2. **Verify:**
   - [ ] Appropriate error message
   - [ ] No crashes

---

## Performance Testing

### Test P.1: Large CSV
1. Upload CSV with 50+ columns
2. **Verify:**
   - [ ] Page loads without lag
   - [ ] Horizontal scroll is smooth
   - [ ] Header badges render quickly

### Test P.2: Many Rows
1. Upload CSV with 1000+ rows
2. **Verify:**
   - [ ] Preview shows first 5 rows only
   - [ ] No performance degradation
   - [ ] Staging area handles large dataset

---

## Bug Report Template

If you find any issues, please report using this format:

```
**Issue:** [Brief description]
**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Theme:** Light / Dark / Midnight
**CSV Columns:** [Number of columns]
**Screenshot:** [If applicable]
```

---

## Success Criteria

All tests must pass for the refactoring to be considered complete:

- [ ] Dynamic preview works for 3, 13, and 50+ column CSVs
- [ ] Header tokens accurately reflect mapping status
- [ ] All form elements readable in Light Mode
- [ ] All form elements readable in Dark Mode
- [ ] All form elements readable in Midnight Mode
- [ ] No regressions in existing functionality
- [ ] No TypeScript errors
- [ ] No console errors

---

## Quick Start

**Fastest way to test:**

1. Open app in Light Mode
2. Navigate to Import Wizard
3. Upload `.artifacts/test-import-3-columns.csv`
4. Check:
   - Preview shows 3 columns ✓
   - 3 red badges appear ✓
   - Inputs are readable ✓
5. Map all 3 fields
6. Check:
   - All badges turn green ✓
7. Switch to Dark Mode
8. Repeat steps 2-6
9. ✅ Done!

---

**Happy Testing! 🚀**

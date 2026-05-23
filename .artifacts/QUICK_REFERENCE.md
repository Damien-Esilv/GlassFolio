# Import Wizard - New Features Quick Reference

## 🎯 What's New

### 1. Dynamic CSV Preview
**What it does:** Shows ALL columns from your CSV, not just a fixed set.

**How to use:**
1. Upload any CSV file
2. Preview automatically shows all columns
3. Scroll horizontally if CSV has many columns

**Examples:**
- 3-column CSV → Shows 3 columns
- 13-column CSV → Shows 13 columns
- 50-column CSV → Shows 50 columns (with scroll)

---

### 2. Visual Mapping Status
**What it does:** Shows which CSV headers are mapped vs. unmapped at a glance.

**How to read:**
- 🟢 **Green Badge** = This header is mapped to a database field
- 🔴 **Red Badge** = This header is NOT mapped (will be ignored)

**How to use:**
1. Upload CSV
2. Look at "CSV Headers (Mapping Status)" panel
3. Map fields using dropdowns below
4. Watch badges turn green as you map

**Pro Tip:** Aim for all green badges to ensure no data is lost!

---

### 3. Light Mode Support
**What it does:** Import wizard now works perfectly in Light Mode.

**Fixed issues:**
- ✅ No more white text on white background
- ✅ All form inputs are readable
- ✅ All dropdowns are readable
- ✅ Consistent across all themes

**How to use:**
1. Go to Settings → Preferences
2. Select "Light" theme
3. Navigate to Import Wizard
4. Everything is now readable!

---

## 📋 Quick Start Guide

### Importing a CSV in 5 Steps

1. **Select Context**
   - Choose Institution
   - Choose Account
   - Choose Mode (History or Snapshot)

2. **Upload File**
   - Drag & drop CSV or click to browse
   - Preview shows ALL your columns

3. **Map Columns**
   - Check header badges (🔴 = unmapped, 🟢 = mapped)
   - Map required fields: Date, Symbol, Amount
   - Map optional fields as needed
   - Goal: Turn all important badges green!

4. **Review & Edit**
   - Check staged transactions
   - Fix any errors
   - Resolve duplicates

5. **Import**
   - Click "Import X Transactions"
   - Done! ✅

---

## 🎨 Theme Support

### All Three Themes Now Supported

| Theme | Status | Notes |
|-------|--------|-------|
| **Light** | ✅ Fixed | All elements readable |
| **Dark** | ✅ Working | No changes, still works |
| **Midnight** | ✅ Working | Deep mode compatible |

**To switch themes:**
Settings → Preferences → Theme

---

## 🔍 Understanding the Mapping Panel

### Example: 13-Column CSV

```
CSV Headers (Mapping Status)
┌─────────────────────────────────────────────────────┐
│ [Date]🟢 [Time]🔴 [Symbol]🟢 [ISIN]🟢 [Quantity]🟢  │
│ [Price]🟢 [Fee]🔴 [Total]🔴 [Currency]🔴 [Type]🔴   │
│ [Description]🔴 [Reference]🔴 [Balance]🔴            │
│                                                     │
│ 🟢 Mapped    🔴 Not Mapped                          │
└─────────────────────────────────────────────────────┘
```

**What this tells you:**
- ✅ 5 columns are mapped (Date, Symbol, ISIN, Quantity, Price)
- ❌ 8 columns are NOT mapped (Time, Fee, Total, etc.)
- 💡 You might want to map "Fee" and "Type" for better data

---

## 💡 Pro Tips

### Tip 1: Check All Badges Before Importing
**Why:** Red badges = data will be ignored
**How:** Scroll through header badges, map any important ones

### Tip 2: Use the Preview
**Why:** Verify data looks correct before importing
**How:** Check preview table shows expected values

### Tip 3: Save Mapping Templates
**Why:** Reuse mappings for similar CSVs
**How:** Click "Save as template" after mapping

### Tip 4: Map Optional Fields
**Why:** Get richer data (fees, ISIN, descriptions)
**How:** Map fields beyond the 3 required ones

### Tip 5: Use Auto-Detection
**Why:** Save time on common formats
**How:** Upload CSV, check if green banner appears

---

## 🐛 Troubleshooting

### Issue: Can't read form inputs
**Solution:** Switch to Light or Dark mode (Settings → Preferences)

### Issue: Preview shows wrong columns
**Solution:** This is now fixed! Preview shows actual CSV columns.

### Issue: Don't know which columns are mapped
**Solution:** Look at header badges: 🟢 = mapped, 🔴 = not mapped

### Issue: Too many columns to see
**Solution:** Scroll horizontally in preview table

### Issue: Badge won't turn green
**Solution:** Make sure you selected a value in the dropdown (not "— Not mapped —")

---

## 📊 Examples

### Example 1: Minimal CSV (3 columns)
```csv
Date,Asset,Amount
2024-01-15,BTC,1500.00
```

**Mapping:**
- Date → Transaction Date 🟢
- Asset → Asset Symbol 🟢
- Amount → Amount 🟢

**Result:** All 3 badges green, ready to import!

---

### Example 2: Detailed CSV (13 columns)
```csv
Date,Time,Symbol,ISIN,Quantity,Price,Fee,Total,Currency,Type,Description,Reference,Balance
```

**Minimum Mapping:**
- Date → Transaction Date 🟢
- Symbol → Asset Symbol 🟢
- Total → Amount 🟢
- (10 columns remain red 🔴)

**Recommended Mapping:**
- Date → Transaction Date 🟢
- Symbol → Asset Symbol 🟢
- ISIN → ISIN Code 🟢
- Quantity → Quantity 🟢
- Price → Price per Unit 🟢
- Fee → Fee Amount 🟢
- Total → Amount 🟢
- Type → Transaction Type 🟢
- Description → Description 🟢
- (4 columns remain red: Time, Currency, Reference, Balance)

**Result:** 9 green, 4 red - much better data quality!

---

## 🎓 Best Practices

1. **Always check header badges** before importing
2. **Map as many fields as possible** for richer data
3. **Use the preview** to verify data looks correct
4. **Save templates** for recurring imports
5. **Review staging area** before final import
6. **Fix errors** rather than skipping rows

---

## 📞 Need Help?

If you encounter issues:
1. Check this quick reference
2. Review the Testing Guide (`.artifacts/TESTING_GUIDE.md`)
3. Check the Summary (`.artifacts/IMPORT_REFACTORING_SUMMARY.md`)
4. Report bugs using the template in Testing Guide

---

**Happy Importing! 🚀**

*Last updated: 2026-02-08*

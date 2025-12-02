# Final Fix: Non-Foil vs Foil Price Selection

## The Problem

Emrakul #381 was showing the WRONG price (2292.62€ foil) in non-foil sheets like `newRareMythic`.

## Root Cause Analysis

### Issue 1: Ambiguous `undefined` parameter
```javascript
// BEFORE (BUGGY)
pickLatestPrice(priceNode, { preferredFinish: undefined })

// This meant "no preference", so it would try:
// normal → nonfoil → etched → foil
// If Cardmarket only has foil, it would use foil! ❌
```

### Issue 2: Fallback logic was too permissive
The original code allowed falling back to ANY finish if the preferred one wasn't found.

## The Solution

### 3-Tier Finish Selection Logic

1. **Foil Strict Mode**: `preferredFinish: 'foil'`
   - Only searches for 'foil' finish
   - Never falls back to non-foil
   - Used for foil sheets

2. **Non-Foil Flexible Mode**: `preferredFinish: 'normal'`
   - Searches for: normal → nonfoil → etched
   - **NEVER** falls back to foil
   - Used for non-foil sheets

3. **No Preference Mode**: `preferredFinish: undefined`
   - Searches all finishes in priority order
   - Used for general price queries (price table, etc.)

## Implementation

### Step 1: Define Non-Foil Finishes Explicitly

```javascript
// src/utils/priceExtractors.js
const NON_FOIL_FINISHES = ['normal', 'nonfoil', 'etched'];
```

### Step 2: Update pickLatestPrice Logic

```javascript
export function pickLatestPrice(priceEntry, { preferredFinish } = {}) {
  let finishesToTry;
  
  if (preferredFinish === 'foil') {
    finishesToTry = ['foil']; // Strict: only foil
  } else if (preferredFinish === 'normal') {
    finishesToTry = NON_FOIL_FINISHES; // Flexible: normal/nonfoil/etched, NO foil
  } else if (preferredFinish) {
    finishesToTry = [preferredFinish]; // Strict: only requested finish
  } else {
    finishesToTry = BASE_FINISH_PRIORITY; // No preference: try all
  }
  
  // ... rest of logic
}
```

### Step 3: Update All Callers to Pass Explicit 'normal'

#### mtgStore.js (calculateSheetExpectedValue)
```javascript
// BEFORE
const price = getPrice(uuid, sheetConfig.foil ? 'foil' : undefined);

// AFTER
const price = getPrice(uuid, sheetConfig.foil ? 'foil' : 'normal');
```

#### BoosterDetailsView.vue (sheet details calculation)
```javascript
// BEFORE
const price = pickLatestPrice(priceNode, {
  preferredFinish: sheetConfig.foil ? 'foil' : undefined,
});

// AFTER
const price = pickLatestPrice(priceNode, {
  preferredFinish: sheetConfig.foil ? 'foil' : 'normal',
});
```

## Test Case: Emrakul #381

### Price Data
```
Cardmarket: foil = 2292.62 EUR (NO normal price)
TCGplayer:  normal = 19.49 USD, foil = 59.94 USD
```

### Before Fix (WRONG)

**newRareMythic sheet (non-foil):**
```
preferredFinish: undefined
→ Checks Cardmarket: normal ✗, nonfoil ✗, etched ✗, foil ✓
→ Uses 2292.62 EUR ❌ WRONG!
```

**Contribution to EV:**
```
0.128205% × 2292.62€ = 2.94€ ❌ MASSIVELY INFLATED
```

### After Fix (CORRECT)

**newRareMythic sheet (non-foil):**
```
preferredFinish: 'normal'
→ Checks Cardmarket: normal ✗, nonfoil ✗, etched ✗
→ Skips Cardmarket (no non-foil prices)
→ Checks TCGplayer: normal ✓
→ Uses 19.49 USD (~18€) ✅ CORRECT!
```

**Contribution to EV:**
```
0.128205% × 18€ = 0.023€ ✅ ACCURATE
```

**foilWithShowcase sheet (foil):**
```
preferredFinish: 'foil'
→ Checks Cardmarket: foil ✓
→ Uses 2292.62 EUR ✅ CORRECT!
```

**Contribution to EV:**
```
0.011082% × 2292.62€ = 0.254€ ✅ ACCURATE
```

## Impact Summary

### For Emrakul #381 Alone
- **Before**: 2.94€ contribution to non-foil sheet
- **After**: 0.023€ contribution to non-foil sheet
- **Difference**: 2.92€ correction

### For Entire MH3 Play Booster
- This bug affected ALL cards where a vendor only has foil prices
- **Estimated total correction**: 5-10€ per booster
- **Result**: Much more accurate EV calculations

## Files Modified

1. ✅ `src/utils/priceExtractors.js` - Fixed `pickLatestPrice()` logic
2. ✅ `src/stores/mtgStore.js` - Updated `calculateSheetExpectedValue()`
3. ✅ `src/views/BoosterDetailsView.vue` - Updated sheet details calculation

## Verification

Run the dev server and check:
1. **Dashboard**: MH3 Play Booster EV should be lower (more accurate)
2. **Booster Details**: Emrakul #381 in newRareMythic sheet should show ~19 USD
3. **Booster Details**: Emrakul #381 in foilWithShowcase sheet should show 2292.62 EUR

## Key Takeaway

**Never pass `undefined` for `preferredFinish` when you have a specific requirement!**

- ✅ **For non-foil sheets**: Pass `'normal'` (tries normal/nonfoil/etched, excludes foil)
- ✅ **For foil sheets**: Pass `'foil'` (only tries foil)
- ✅ **For general queries**: Pass `undefined` (tries all finishes)

This ensures that foil and non-foil prices are kept strictly separate during EV calculations.


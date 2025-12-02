# Developer Guide - MTG Valuation

## Quick Reference

### Key Files

```
src/
├── stores/
│   └── mtgStore.js              # Main store with EV calculations
├── services/
│   ├── mtgjsonClient.js         # Local JSON file loader
│   └── jsonCache.js             # localStorage caching
├── utils/
│   └── priceExtractors.js       # Price extraction utilities
├── composables/
│   └── useI18n.js               # Internationalization (EN/FR/ES)
└── views/
    ├── DashboardView.vue        # Main dashboard with EV tables
    ├── PricesView.vue           # Card price list
    ├── BoosterDetailsView.vue   # Detailed booster breakdown
    ├── TrendPricesView.vue      # Manual price configuration
    └── BoosterExplanationsView.vue # EV calculation explanations

public/
├── mtgjson/
│   ├── SetList.json             # All MTG sets
│   ├── AllIdentifiers.json      # All card identifiers
│   ├── AllPricesToday.json      # Card prices
│   └── sets/                    # Individual set files
│       └── {CODE}.json          # e.g., MH3.json, DSK.json
└── trend-prices-config.json     # Manual booster trend prices
```

### Understanding the EV Calculation

#### Step 1: Sheet Expected Value
A **sheet** is a collection of cards with weights (probabilities).

```javascript
// Example: Common sheet with 80 cards, each weight=1
const commonSheet = {
  cards: {
    'uuid-card-1': 1,  // Weight 1 = 1/80 probability
    'uuid-card-2': 1,
    // ... 80 total cards
  },
  totalWeight: 80,
  foil: false
};

// EV = Σ (card_price × card_weight / total_weight)
// If card 1 = 0.10€, card 2 = 0.15€, ...
// EV_common = (1/80 × 0.10) + (1/80 × 0.15) + ... = ~0.50€
```

#### Step 2: Layout Expected Value
A **layout** defines which sheets are drawn and how many cards from each.

```javascript
// Example: Play booster layout
const layout1 = {
  weight: 189,  // This layout has 29.5% probability (189/640)
  contents: {
    common: 6,           // Draw 6 commons
    newRareMythic: 1,    // Draw 1 rare/mythic
    newUncommon: 3,      // Draw 3 uncommons
    // ... more sheets
  }
};

// EV = Σ (quantity × sheet_EV)
// EV_layout1 = (6 × 0.50) + (1 × 2.00) + (3 × 0.15) = 5.45€
```

#### Step 3: Booster Expected Value
Average across all layouts, weighted by probability.

```javascript
// Example: Play booster with 6 layouts
const booster = {
  boosters: [
    { weight: 189, contents: {...} },  // Layout 1
    { weight: 150, contents: {...} },  // Layout 2
    // ... 6 total layouts
  ],
  boostersTotalWeight: 640
};

// EV = Σ (layout_EV × layout_weight) / total_weight
// EV_booster = (5.45×189 + 5.20×150 + ...) / 640 = ~5.30€
```

### Common Tasks

#### Adding a New Set
1. Download `{CODE}.json` from MTGJSON
2. Place in `public/mtgjson/sets/`
3. Reload the app - it will appear automatically

#### Modifying Trend Prices
1. Edit `public/trend-prices-config.json`
2. Add/modify prices under `trendPrices[setCode][boosterType]`
3. Reload the app

```json
{
  "trendPrices": {
    "MH3": {
      "play": 8.76,
      "draft": 4.00,
      "set": 4.50
    }
  }
}
```

#### Adding a Translation
1. Edit `src/composables/useI18n.js`
2. Add new language to `languages` object
3. Add translations to `translations` object

```javascript
const languages = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',  // New language
};

const translations = {
  de: {
    'nav.booster-valuation': 'Booster-Bewertung',
    // ... more translations
  }
};
```

### Store API Reference

#### Loading Data
```javascript
import { useMtgStore } from '@/stores/mtgStore';
const store = useMtgStore();

// Load set list
await store.loadSetList();

// Select a set
await store.setSelectedSet('MH3');

// Load booster valuations
await store.computeBoosterValuations({ minPrice: 1 });

// Load card prices
await store.loadSetPrices('MH3');

// Load booster rankings
await store.loadBoosterRanking({ 
  yearsBack: 4, 
  minPrice: 1 
});
```

#### Accessing Results
```javascript
// Current set details
const setDetail = store.setDetail;
const boosterTypes = store.boosterTypes;

// Booster valuations
const valuations = store.boosterValuations;
// Each valuation has:
// {
//   boosterType: 'play',
//   averageValue: 5.30,
//   currency: 'EUR',
//   layoutCount: 6,
//   sheetBreakdown: { ... },
//   boosterPrices: [ ... ]
// }

// Card price table
const priceTable = store.priceTable;

// Rankings
const topBargains = store.playBoosterTop;
const overpriced = store.playBoosterBottom;
```

### Debugging Tips

#### Check Data Loading
```javascript
// In browser console
const store = useMtgStore();
console.log('Price index loaded:', store.priceIndexLoaded);
console.log('Sealed products loaded:', store.sealedProductPriceIndexLoaded);
console.log('Number of sets:', store.setList.length);
```

#### Inspect Calculations
```javascript
// Check a specific booster's calculation
const mh3 = store.setDetail;
const valuations = store.buildBoosterValuations(mh3, { minPrice: 1 });
console.log('Play booster:', valuations.find(v => v.boosterType === 'play'));

// Check sheet breakdown
const playBooster = valuations.find(v => v.boosterType === 'play');
console.log('Sheet EVs:', playBooster.sheetBreakdown);
```

#### Clear Cache
```javascript
// Clear localStorage cache
localStorage.clear();

// Clear in-memory cache
const store = useMtgStore();
store.priceCache = {};
```

### Performance Notes

#### Large Files
- `AllPricesToday.json`: ~50 MB
- `AllIdentifiers.json`: ~30 MB
- Individual set files: ~500 KB - 2 MB

These are loaded once and cached in memory. Be aware of memory usage.

#### Calculation Complexity
For a typical set:
- 9 sheets × 100-500 cards each = ~3000 price lookups
- 6 layouts × 9 sheets = 54 sheet EV multiplications
- Final weighted average across layouts

With caching, calculations take ~100-500ms per set.

### Best Practices

#### 1. Use the Store Actions
❌ Don't fetch data directly:
```javascript
const payload = await fetchLocalSet('MH3');
```

✅ Use store actions:
```javascript
await store.setSelectedSet('MH3');
```

#### 2. Check Loading State
❌ Don't assume data is ready:
```javascript
const prices = store.priceTable;
```

✅ Check loading state:
```vue
<template>
  <div v-if="store.priceTableLoading">Loading...</div>
  <div v-else>{{ store.priceTable }}</div>
</template>
```

#### 3. Handle Errors
❌ Don't ignore errors:
```javascript
await store.computeBoosterValuations();
```

✅ Display error messages:
```vue
<ElAlert v-if="store.boosterValuationsError" type="error">
  {{ store.boosterValuationsError }}
</ElAlert>
```

### Troubleshooting

#### "Missing file: public/mtgjson/..."
- Ensure MTGJSON files are in the correct location
- Check file names match exactly (case-sensitive)
- Verify files are not empty

#### Incorrect EV Calculations
- Check `minPrice` parameter (cards below this count as 0€)
- Verify prices exist in `AllPricesToday.json`
- Check for foil vs non-foil confusion

#### Slow Performance
- Large sets (500+ cards) may take longer
- Check browser console for memory warnings
- Consider clearing cache if data is stale

#### Rankings Not Updating
- Ensure `yearsBack` parameter is set correctly
- Check that trend prices config is loaded
- Verify set release dates are valid

## Contributing

When adding new features:

1. **Add JSDoc comments** to all functions
2. **Update STORE_ARCHITECTURE.md** if changing data flow
3. **Test with multiple sets** (small and large)
4. **Check memory usage** with Chrome DevTools
5. **Verify calculations** against known values

## Additional Resources

- [MTGJSON Documentation](https://mtgjson.com/)
- [Booster Structure Explanation](https://mtgjson.com/data-models/booster/)
- [Pinia Store Guide](https://pinia.vuejs.org/)
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)


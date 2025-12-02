# MTG Store Architecture

## Overview

The `mtgStore.js` is the central Pinia store that manages all MTG card and booster data. It handles data loading, caching, and complex Expected Value (EV) calculations for booster packs.

## Core Concepts

### Expected Value (EV) Calculation

The store calculates the expected monetary value of opening a booster pack by:

1. **Sheet EV**: Calculate the weighted average price of cards in each sheet
2. **Layout EV**: Sum the value of all sheets drawn in a specific layout
3. **Booster EV**: Calculate the weighted average across all possible layouts

```
Sheet EV = Σ (card_price × card_weight / sheet_total_weight)
Layout EV = Σ (quantity × sheet_EV)
Booster EV = Σ (layout_EV × layout_weight) / total_layout_weight
```

### Key Features

- **Local-first**: All data is loaded from local MTGJSON files (no network calls)
- **Caching**: Results are cached to avoid redundant calculations
- **Minimum Price Filter**: Cards below a threshold can be excluded from EV calculations
- **Multiple Booster Types**: Supports play, draft, set, collector boosters
- **Market Price Comparison**: Compares calculated EV with actual booster prices

## State Structure

```javascript
{
  // Set data
  setList: [],              // All available MTG sets
  selectedSetCode: '',      // Currently selected set code
  setDetail: {},            // Detailed info for selected set
  
  // Card and price indexes
  identifierIndex: {},      // UUID -> card info
  cardsBySet: {},           // setCode -> [cards]
  priceIndex: {},           // UUID -> price data
  sealedProductPriceIndex: {}, // UUID -> booster prices
  
  // Calculated results
  boosterValuations: [],    // EV calculations for current set
  priceTable: [],           // Card price table for current set
  
  // Rankings
  playBoosterTop: [],       // Top 10 bargain boosters
  playBoosterBottom: [],    // Top 10 overpriced boosters
  
  // Configuration
  trendPriceConfig: {},     // Manual booster price config
}
```

## Main Functions

### Data Loading

#### `loadSetList()`
Loads the complete list of MTG sets from `SetList.json`. Called once on app initialization.

#### `loadSetDetail(code)`
Loads detailed information for a specific set, including:
- Card list
- Booster configurations (sheets and layouts)
- Sealed product information

#### `ensurePriceIndex()`
Loads all card prices from `AllPricesToday.json`. Indexed by card UUID.

#### `ensureSealedProductPriceIndex()`
Loads actual market prices for sealed booster products.

### EV Calculation Pipeline

#### `buildBoosterValuations(setData, { minPrice })`
Main entry point for EV calculations. Returns valuations for all booster types in a set.

**Process:**
1. Create a cached price getter
2. Calculate EV for each sheet
3. Calculate EV for each layout
4. Calculate weighted average across layouts
5. Fetch actual booster prices
6. Return complete valuation object

**Broken down into:**

##### `createPriceGetter(minPrice)`
Creates a cached function for fetching card prices. Applies minimum price filter.

##### `calculateSheetExpectedValue(sheetConfig, getPrice)`
Calculates the expected value of drawing one card from a sheet.

**Formula:** `EV = Σ (card_price × card_weight / sheet_total_weight)`

**Key considerations:**
- Handles foil sheets (uses foil prices)
- Respects minimum price threshold
- Caches results

##### `calculateLayoutExpectedValue(layout, sheetExpectations)`
Calculates the expected value of a specific booster layout.

**Formula:** `EV = Σ (quantity × sheet_EV)`

Example: If layout has 6 commons + 1 rare + 3 uncommons:
```
EV = (6 × common_EV) + (1 × rare_EV) + (3 × uncommon_EV)
```

##### `calculateBoosterExpectedValue(layouts, sheetExpectations)`
Calculates the weighted average EV across all possible layouts.

**Formula:** `EV = Σ (layout_EV × layout_weight) / total_weight`

Example: If there are 3 layouts with different probabilities:
```
EV = (layout1_EV × 189 + layout2_EV × 150 + layout3_EV × 120) / 640
```

### Ranking Functions

#### `loadBoosterRanking({ yearsBack, minPrice })`
Analyzes multiple sets to find the best and worst booster deals.

**Process:**
1. Filter sets by release date
2. Calculate EV for each set's boosters
3. Compare EV with actual market prices
4. Sort by difference (EV - price)
5. Extract top 10 bargains and top 10 overpriced

**Result:**
- `playBoosterTop`: Boosters where EV > price (good deals)
- `playBoosterBottom`: Boosters where EV < price (overpriced)

### Price Table Functions

#### `loadSetPrices(code)`
Loads and formats card prices for display in a sortable table.

**Process:**
1. Load card identifiers
2. Load price index
3. Match cards to prices
4. Format for display
5. Sort by price (highest first)
6. Cache results

## Data Flow Example

### Opening the App and Selecting a Set

```
User Action: Select "Modern Horizons 3"
    ↓
1. loadSetList()
    → Loads SetList.json
    → Populates setList state
    ↓
2. setSelectedSet('MH3')
    → Sets selectedSetCode = 'MH3'
    → Calls loadSetDetail('MH3')
        → Loads MH3.json
        → Populates setDetail state
    ↓
3. computeBoosterValuations({ minPrice: 1 })
    → Calls ensurePriceIndex()
        → Loads AllPricesToday.json (if not loaded)
    → Calls ensureSealedProductPriceIndex()
    → Calls buildBoosterValuations(setDetail, { minPrice: 1 })
        ↓
        For each booster type (play, draft, etc.):
            ↓
            For each sheet (common, rare, etc.):
                → calculateSheetExpectedValue()
                → Get each card's price
                → Calculate weighted average
                → Store sheet EV
            ↓
            For each layout:
                → calculateLayoutExpectedValue()
                → Sum (quantity × sheet_EV)
                → Store layout EV
            ↓
            → calculateBoosterExpectedValue()
            → Weighted average of layout EVs
            → Store final booster EV
    ↓
    → Populates boosterValuations state
    → UI displays results
```

## Performance Considerations

### Caching Strategy

1. **Price Cache**: `Map` cache within `buildBoosterValuations` to avoid repeated price lookups
2. **Result Cache**: `priceCache` object stores processed price tables by set code
3. **Data Indexes**: `identifierIndex` and `priceIndex` loaded once and reused

### Large File Handling

- MTGJSON files can be several MB
- Files are cached in localStorage (via jsonCache service)
- Only loaded once per session
- Large files kept in memory only (not in localStorage)

## Configuration

### Trend Price Config

File: `public/trend-prices-config.json`

Structure:
```json
{
  "trendPrices": {
    "MH3": {
      "play": 8.76,
      "draft": 4.0,
      "set": 4.5
    }
  },
  "defaultPrices": {
    "play": 5.0,
    "draft": 4.0,
    "set": 4.5
  }
}
```

Used as fallback when actual sealed product prices are unavailable.

## Error Handling

All async functions follow this pattern:
```javascript
try {
  // Load data
  // Process data
  // Update state
} catch (error) {
  // Set error state
  // Log warning/error
} finally {
  // Clear loading state
}
```

## Future Improvements

- [ ] Add incremental loading for large datasets
- [ ] Implement Web Workers for heavy calculations
- [ ] Add data validation and schema checking
- [ ] Implement automatic cache invalidation
- [ ] Add unit tests for calculation functions


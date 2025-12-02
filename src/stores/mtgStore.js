/**
 * MTG Valuation Store
 * 
 * Main Pinia store for managing Magic: The Gathering card and booster data.
 * 
 * Key Features:
 * - Loads set information and card data from local MTGJSON files
 * - Calculates expected value (EV) of booster packs using probability-weighted card prices
 * - Compares booster EV against actual market prices to identify bargains
 * - Provides price tables for individual cards within sets
 * 
 * Data Flow:
 * 1. Load base data (SetList, AllIdentifiers, AllPrices)
 * 2. Select a set and load detailed set data
 * 3. Calculate sheet EVs (weighted average of card prices)
 * 4. Calculate layout EVs (sum of sheet quantities × sheet EVs)
 * 5. Calculate booster EV (weighted average across layouts)
 * 
 * EV Calculation Formula:
 * - Sheet EV = Σ (card_price × card_weight / sheet_total_weight)
 * - Layout EV = Σ (quantity × sheet_EV)
 * - Booster EV = Σ (layout_EV × layout_weight) / total_layout_weight
 */

import { defineStore } from 'pinia';
import { fetchLocalJson, fetchLocalSet } from '../services/mtgjsonClient.js';
import { pickLatestPrice } from '../utils/priceExtractors.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const useMtgStore = defineStore('mtg', {
  state: () => ({
    setList: [],
    setListLoading: false,
    setListError: '',
    selectedSetCode: '',
    setDetail: null,
    detailLoading: false,
    detailError: '',
    identifiersLoaded: false,
    identifierIndex: {},
    cardsBySet: {},
    priceIndexLoaded: false,
    priceIndex: {},
    priceCache: {},
    priceTable: [],
    priceTableSet: '',
    priceTableLoading: false,
    priceTableError: '',
    boosterValuations: [],
    boosterValuationsLoading: false,
    boosterValuationsError: '',
    playBoosterTop: [],
    playBoosterBottom: [],
    playBoosterRankingLoading: false,
    playBoosterRankingError: '',
    trendPriceConfig: null,
  }),
  getters: {
    /**
     * Returns the set list sorted by release date (newest first)
     * Used for populating set selection dropdowns
     */
    setOptions(state) {
      return state.setList
        .slice()
        .sort((a, b) => {
          const dateA = new Date(a.releaseDate ?? '1970-01-01').getTime();
          const dateB = new Date(b.releaseDate ?? '1970-01-01').getTime();
          return dateB - dateA; // Newest first
        });
    },

    /**
     * Returns available booster types for the currently selected set
     * Examples: ['play', 'draft', 'set', 'collector']
     */
    boosterTypes(state) {
      if (!state.setDetail?.booster) return [];
      return Object.keys(state.setDetail.booster);
    },

    /**
     * Returns card statistics for the currently selected set
     * Includes total card count and breakdown by rarity
     */
    cardStats(state) {
      const cards = state.setDetail?.cards ?? [];

      // Count cards by rarity
      const rarities = cards.reduce((acc, card) => {
        const rarity = card.rarity ?? 'unknown';
        acc[rarity] = (acc[rarity] ?? 0) + 1;
        return acc;
      }, {});

      return {
        total: cards.length,
        rarities,
      };
    },
  },
  actions: {
    /**
     * Loads the complete list of MTG sets from MTGJSON
     * Cached for 6 hours to avoid repeated file reads
     * 
     * @param {object} options - { force: bypass cache and reload }
     */
    async loadSetList({ force = false } = {}) {
      if (this.setList.length && !force) return;

      this.setListLoading = true;
      this.setListError = '';

      try {
        const payload = await fetchLocalJson('SetList.json', {
          ttlMs: SIX_HOURS_MS,
        });
        this.setList = payload?.data ?? [];
      } catch (error) {
        this.setListError = 'Could not load SetList.json. Ensure public/mtgjson/SetList.json exists.';
      } finally {
        this.setListLoading = false;
      }
    },

    /**
     * Sets the currently selected set and loads its details
     * Clears previous set data and booster valuations
     * 
     * @param {string} code - Set code (e.g., 'MH3', 'DSK')
     */
    async setSelectedSet(code) {
      this.selectedSetCode = code;

      // Clear data if no code provided
      if (!code) {
        this.setDetail = null;
        this.boosterValuations = [];
        this.boosterValuationsError = '';
        return;
      }

      await this.loadSetDetail(code);
    },

    /**
     * Loads detailed information for a specific set
     * Includes cards, booster configurations, sealed products, etc.
     * 
     * @param {string} code - Set code (defaults to currently selected set)
     */
    async loadSetDetail(code = this.selectedSetCode) {
      if (!code) return;

      this.detailLoading = true;
      this.detailError = '';

      try {
        const payload = await fetchLocalSet(code, {
          ttlMs: SIX_HOURS_MS,
        });
        this.setDetail = payload.data ?? null;
      } catch (error) {
        this.detailError = `Missing file: public/mtgjson/sets/${code.toUpperCase()}.json`;
        this.boosterValuations = [];
      } finally {
        this.detailLoading = false;
      }
    },

    /**
     * Loads and indexes all card identifiers from MTGJSON
     * Creates two indexes:
     * - identifierIndex: UUID -> card info
     * - cardsBySet: setCode -> array of cards
     */
    async ensureIdentifiers() {
      if (this.identifiersLoaded) return;

      // Load AllIdentifiers.json (contains all cards)
      const payload = await fetchLocalJson('AllIdentifiers.json', {
        ttlMs: 12 * 60 * 60 * 1000, // Cache for 12 hours
      }).catch(() => {
        throw new Error('Missing file: public/mtgjson/AllIdentifiers.json');
      });

      const liteIndex = {};
      const grouped = {};

      // Process each card and create indexes
      Object.entries(payload.data ?? {}).forEach(([uuid, card]) => {
        const setCode = card.setCode?.toUpperCase();
        if (!setCode) return;

        // Create lightweight card object
        const lite = {
          uuid,
          setCode,
          name: card.name,
          rarity: card.rarity ?? 'unknown',
          number: card.number,
          types: card.types ?? [],
          manaValue: card.manaValue ?? null,
        };

        // Index by UUID
        liteIndex[uuid] = lite;

        // Group by set code
        if (!grouped[setCode]) grouped[setCode] = [];
        grouped[setCode].push(lite);
      });

      this.identifierIndex = liteIndex;
      this.cardsBySet = grouped;
      this.identifiersLoaded = true;
    },

    /**
     * Loads the price index containing all card prices from MTGJSON
     * Structure: { uuid -> { paper: { cardmarket: { retail: { ... } } } } }
     * Only loaded once per session
     */
    async ensurePriceIndex() {
      if (this.priceIndexLoaded) return;

      const payload = await fetchLocalJson('AllPricesToday.json', {
        ttlMs: SIX_HOURS_MS,
      }).catch(() => {
        throw new Error('Missing file: public/mtgjson/AllPricesToday.json');
      });

      this.priceIndex = payload.data ?? {};
      this.priceIndexLoaded = true;
    },

    /**
     * Loads card prices for a specific set and creates a sortable table
     * Results are cached to avoid reprocessing
     * 
     * @param {string} code - Set code (e.g., 'MH3', 'DSK')
     */
    async loadSetPrices(code) {
      const normalized = code?.toUpperCase();
      this.priceTableSet = normalized ?? '';

      // Clear table if no code provided
      if (!normalized) {
        this.priceTable = [];
        return;
      }

      // Return cached data if available
      if (this.priceCache[normalized]) {
        this.priceTable = this.priceCache[normalized];
        return;
      }

      this.priceTableLoading = true;
      this.priceTableError = '';

      try {
        // Load required data
        await this.ensureIdentifiers();
        await this.ensurePriceIndex();

        // Get all cards for this set
        const cards = this.cardsBySet[normalized] ?? [];

        // Build price table rows
        const rows = cards.map((card) => {
          const priceNode = this.priceIndex[card.uuid];
          const latest = pickLatestPrice(priceNode);

          // Build variant description
          const descriptors = [];
          if (card.number) descriptors.push(`Collector #: ${card.number}`);
          if (latest?.finish) descriptors.push(`Finish: ${latest.finish}`);
          if (latest?.medium) descriptors.push(`Medium: ${latest.medium}`);
          if (latest?.vendor) descriptors.push(`Vendor: ${latest.vendor}`);
          if (latest?.source) descriptors.push(`Source: ${latest.source}`);
          const variantSummary = descriptors.join(' · ') || 'Standard printing';

          return {
            ...card,
            price: latest?.value ?? null,
            currency: latest?.currency ?? 'USD',
            vendor: latest?.vendor ?? 'N/A',
            finish: latest?.finish ?? 'normal',
            source: latest?.source ?? '',
            medium: latest?.medium ?? 'paper',
            lastUpdated: latest?.date ?? '',
            variantSummary,
          };
        });

        // Sort by price (highest first) and cache
        const sorted = rows.slice().sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        this.priceCache[normalized] = sorted;
        this.priceTable = sorted;
      } catch (error) {
        this.priceTableError = error.message ?? 'Unable to compute set prices.';
      } finally {
        this.priceTableLoading = false;
      }
    },

    /**
     * Creates a cached price getter function
     * @param {number} minPrice - Minimum price threshold (cards below this count as 0€)
     * @returns {function} Function to get prices with caching
     */
    createPriceGetter(minPrice) {
      const priceCache = new Map();

      return (uuid, preferredFinish) => {
        // Check cache first to avoid redundant lookups
        const cacheKey = `${uuid}:${preferredFinish ?? 'any'}`;
        if (priceCache.has(cacheKey)) {
          return priceCache.get(cacheKey);
        }

        // Fetch price from the price index
        const price = pickLatestPrice(this.priceIndex[uuid], { preferredFinish }) || null;

        // Apply minimum price filter: cards below threshold count as 0€
        if (price && price.value < minPrice) {
          const adjusted = { ...price, value: 0 };
          priceCache.set(cacheKey, adjusted);
          return adjusted;
        }

        priceCache.set(cacheKey, price);
        return price;
      };
    },

    /**
     * Calculates the expected value (EV) of a single sheet
     * Formula: EV = Σ (card_price × card_weight / total_sheet_weight)
     * 
     * @param {object} sheetConfig - Sheet configuration from MTGJSON
     * @param {function} getPrice - Price getter function
     * @returns {object} Sheet expectation with EV, currency, foil status, etc.
     */
    calculateSheetExpectedValue(sheetConfig, getPrice) {
      const cards = sheetConfig.cards ?? {};
      
      // Calculate or use provided total weight
      const totalWeight = sheetConfig.totalWeight ?? 
        Object.values(cards).reduce((sum, weight) => sum + weight, 0);

      // Handle empty sheets
      if (!totalWeight) {
        return {
          expectedValue: 0,
          currency: 'USD',
          foil: sheetConfig.foil ?? false,
          totalWeight: 0,
          cardCount: 0,
        };
      }

      // Calculate EV by summing weighted card prices
      let currency = null;
      let expectedValue = 0;

      Object.entries(cards).forEach(([uuid, weight]) => {
        // Get price (foil if sheet is foil, normal otherwise)
        // CRITICAL: Pass explicit 'normal' for non-foil sheets to avoid foil price fallback
        const price = getPrice(uuid, sheetConfig.foil ? 'foil' : 'normal');
        const value = price?.value ?? 0;

        // Set currency from first card with a price
        if (!currency && price?.currency) {
          currency = price.currency;
        }

        // Add weighted contribution: (weight / totalWeight) × price
        expectedValue += (weight / totalWeight) * value;
      });

      return {
        expectedValue,
        currency: currency ?? 'USD',
        foil: sheetConfig.foil ?? false,
        totalWeight,
        cardCount: Object.keys(cards).length,
      };
    },

    /**
     * Calculates the expected value (EV) of a single booster layout
     * Formula: EV_layout = Σ (quantity × EV_sheet)
     * 
     * @param {object} layout - Layout configuration from MTGJSON
     * @param {object} sheetExpectations - Pre-calculated EV for each sheet
     * @returns {number} Expected value of the layout
     */
    calculateLayoutExpectedValue(layout, sheetExpectations) {
      return Object.entries(layout.contents ?? {}).reduce(
        (sum, [sheetName, quantity]) => {
          const sheetEV = sheetExpectations[sheetName]?.expectedValue ?? 0;
          return sum + (quantity * sheetEV);
        },
        0
      );
    },

    /**
     * Calculates the weighted average EV across all booster layouts
     * Formula: EV_booster = Σ (EV_layout × layout_weight) / total_weight
     * 
     * @param {array} layouts - Array of layout configurations
     * @param {object} sheetExpectations - Pre-calculated EV for each sheet
     * @returns {object} { averageValue, totalLayoutWeight }
     */
    calculateBoosterExpectedValue(layouts, sheetExpectations) {
      // Calculate total weight of all layouts
      const totalLayoutWeight = layouts.reduce(
        (sum, layout) => sum + (layout.weight ?? 1),
        0
      );

      // Calculate weighted sum of all layout EVs
      let aggregatedValue = 0;
      layouts.forEach((layout) => {
        const layoutValue = this.calculateLayoutExpectedValue(layout, sheetExpectations);
        aggregatedValue += layoutValue * (layout.weight ?? 1);
      });

      // Calculate weighted average
      const averageValue = totalLayoutWeight > 0
        ? aggregatedValue / totalLayoutWeight
        : Object.values(sheetExpectations).reduce((sum, sheet) => sum + sheet.expectedValue, 0);

      return {
        averageValue,
        totalLayoutWeight: totalLayoutWeight || null,
      };
    },

    /**
     * Main function: Builds expected value calculations for all booster types in a set
     * 
     * Process:
     * 1. For each sheet: Calculate EV = Σ (card_price × probability)
     * 2. For each layout: Calculate EV = Σ (quantity × sheet_EV)
     * 3. For the booster: Calculate weighted average across layouts
     * 
     * @param {object} setData - Set data from MTGJSON
     * @param {object} options - { minPrice: minimum card price threshold }
     * @returns {array} Array of booster valuations
     */
    buildBoosterValuations(setData, { minPrice = 0 } = {}) {
      if (!setData?.booster) return [];

      // Create cached price getter
      const getPrice = this.createPriceGetter(minPrice);

      // Process each booster type (play, draft, set, collector, etc.)
      return Object.entries(setData.booster).map(([boosterType, config]) => {
        // ===== STEP 1: Calculate Expected Value for Each Sheet =====
        const sheets = config.sheets ?? {};
        const sheetExpectations = {};

        Object.entries(sheets).forEach(([sheetName, sheetConfig]) => {
          sheetExpectations[sheetName] = this.calculateSheetExpectedValue(sheetConfig, getPrice);
        });

        // ===== STEP 2: Calculate Expected Value for the Booster =====
        const layouts = config.boosters ?? [];
        const { averageValue, totalLayoutWeight } = this.calculateBoosterExpectedValue(
          layouts,
          sheetExpectations
        );

        // ===== STEP 3: Determine currency (based on first sheet) =====
        const currency = Object.values(sheetExpectations)
          .find((sheet) => sheet.currency)?.currency ?? 'USD';

        // ===== STEP 4: Return Complete Valuation =====
        return {
          boosterType,
          averageValue,
          currency,
          layoutCount: layouts.length,
          totalLayoutWeight,
          sheetBreakdown: sheetExpectations,
          boosterPrices: [],
          sealedProductName: null,
        };
      });
    },

    /**
     * Computes booster valuations for the currently selected set
     * This is the main action called by the UI to calculate EV
     * 
     * @param {object} options - { minPrice: minimum card price threshold }
     */
    async computeBoosterValuations({ minPrice = 0 } = {}) {
      this.boosterValuationsLoading = true;
      this.boosterValuationsError = '';
      this.boosterValuations = [];

      try {
        // Check if current set has booster data
        if (!this.setDetail?.booster) {
          this.boosterValuationsLoading = false;
          return;
        }

        // Ensure required data is loaded
        await this.ensurePriceIndex();

        // Calculate valuations and sort by EV (highest first)
        const valuations = this.buildBoosterValuations(this.setDetail, { minPrice });
        this.boosterValuations = valuations.sort((a, b) => b.averageValue - a.averageValue);
      } catch (error) {
        this.boosterValuationsError = error.message ?? 'Failed to compute booster valuations.';
      } finally {
        this.boosterValuationsLoading = false;
      }
    },

    /**
     * Loads the trend price configuration file
     * This file contains manually configured booster prices per set
     * Used as fallback when actual market prices are not available
     * 
     * @returns {object} Configuration object with trendPrices and defaultPrices
     */
    async loadTrendPricesConfig() {
      try {
        const response = await fetch('/trend-prices-config.json');
        if (!response.ok) {
          throw new Error(`Failed to load config: ${response.status}`);
        }
        const config = await response.json();
        return config || { trendPrices: {}, defaultPrices: { play: 5.0, draft: 4.0, set: 4.5 } };
      } catch (error) {
        console.warn('Failed to load trend prices config:', error);
        return { trendPrices: {}, defaultPrices: { play: 5.0, draft: 4.0, set: 4.5 } };
      }
    },

    /**
     * Gets the trend price for a specific booster type in a specific set
     * Returns null if no specific price is configured (no default prices)
     * 
     * @param {string} setCode - Set code (e.g., 'MH3')
     * @param {string} boosterType - Booster type (play, draft, set, etc.)
     * @returns {number|null} Trend price in the default currency, or null if not configured
     */
    getTrendPrice(setCode, boosterType) {
      return this.trendPriceConfig?.trendPrices?.[setCode]?.[boosterType] ?? null;
    },

    /**
     * Loads and ranks boosters across multiple sets to find bargains and overpriced boosters
     * Compares Expected Value (EV) with actual market/trend prices
     * 
     * @param {object} options - { yearsBack: number of years to include, minPrice: minimum card price }
     */
    async loadBoosterRanking({ yearsBack = 4, minPrice = 0 } = {}) {
      this.playBoosterRankingLoading = true;
      this.playBoosterRankingError = '';
      this.playBoosterTop = [];
      this.playBoosterBottom = [];

      try {
        // ===== STEP 1: Load Required Data =====
        if (!this.setList.length) {
        await this.loadSetList();
      }

      const trendConfig = await this.loadTrendPricesConfig();
      this.trendPriceConfig = trendConfig;

      await this.ensurePriceIndex();

        // ===== STEP 2: Filter Sets by Release Date =====
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - yearsBack);

        const candidates = this.setList.filter((set) => {
          if (!set.releaseDate) return false;
          return new Date(set.releaseDate) >= cutoff;
        });

        // ===== STEP 3: Calculate EV and Price Difference for Each Set =====
        const results = [];
        const boosterTypesToInclude = ['play', 'draft', 'set'];

        for (const setInfo of candidates) {
          try {
            // Load set data
            const payload = await fetchLocalSet(setInfo.code, { ttlMs: SIX_HOURS_MS });
            const valuations = this.buildBoosterValuations(payload.data, { minPrice });

            // Process each booster type
            for (const boosterType of boosterTypesToInclude) {
              const entry = valuations.find((e) => e.boosterType === boosterType);
              if (!entry) continue;

              // Get actual price (from sealed product data or trend config)
              const actualPrice = entry.boosterPrices?.[0]?.value ?? 
                this.getTrendPrice(setInfo.code, boosterType);

              // Calculate difference: positive = bargain, negative = overpriced
              const diff = actualPrice !== null ? entry.averageValue - actualPrice : null;
              // Calculate ratio: EV / Price (when EV > Price, ratio > 1)
              const diffPercent = actualPrice !== null && actualPrice > 0 ? entry.averageValue / actualPrice : null;

              results.push({
                code: setInfo.code,
                name: setInfo.name,
                releaseDate: setInfo.releaseDate,
                boosterType,
                currency: entry.currency,
                expectedValue: entry.averageValue,
                trendPrice: actualPrice,
                boosterPrices: entry.boosterPrices ?? [],
                diff,
                diffPercent,
              });
            }
          } catch (error) {
            console.warn(`Failed to compute ranking for set ${setInfo.code}`, error);
          }
        }

        // ===== STEP 4: Sort and Extract Top/Bottom 10 =====
        const sorted = results.sort((a, b) => b.diff - a.diff);
        this.playBoosterTop = sorted.slice(0, 10); // Best bargains (highest positive diff)
        this.playBoosterBottom = sorted.slice().reverse().slice(0, 10); // Most overpriced (highest negative diff)
      } catch (error) {
        this.playBoosterRankingError = error.message ?? 'Failed to compute booster ranking.';
      } finally {
        this.playBoosterRankingLoading = false;
      }
    },
  },
});


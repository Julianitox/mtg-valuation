<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import {
  ElAlert,
  ElButton,
  ElCard,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSkeleton,
  ElTable,
  ElTableColumn,
  ElTag,
  ElCollapse,
  ElCollapseItem,
  ElDivider,
} from 'element-plus';
import { useMtgStore } from '../stores/mtgStore.js';
import { pickLatestPrice } from '../utils/priceExtractors.js';

const store = useMtgStore();
const selectedSet = ref('MH3'); // Default to MH3
const selectedBoosterType = ref('play'); // Default to play booster
const evMinPrice = ref(0); // Minimum card price for EV calculation

// Progressive loading states
const sheetDetailsLoading = ref(false);
const layoutDetailsLoading = ref(false);
const detailedCalculationsLoading = ref(false);
const layoutCalculationsLoading = ref(false);

// Progressive data storage
const sheetDetailsData = ref([]);
const layoutDetailsData = ref([]);
const detailedCalculationsData = ref([]);
const layoutCalculationsData = ref([]);

const setOptions = computed(() => store.setOptions);
const setDetail = computed(() => store.setDetail);
const isLoading = computed(() => store.detailLoading || store.setListLoading);

const boosterTypes = computed(() => {
  if (!store.setDetail?.booster) return [];
  // Sort booster types: play, draft, set, collector, others
  const types = Object.keys(store.setDetail.booster);
  const order = ['play', 'draft', 'set', 'collector', 'collector-sample', 'prerelease'];
  return types.sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
});

// Helper function to process data in chunks
async function processInChunks(items, chunkSize, processor, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = chunk.map(processor);
    results.push(...chunkResults);
    
    if (onProgress) {
      onProgress(i + chunk.length, items.length);
    }
    
    // Yield to browser to prevent blocking
    await new Promise((resolve) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => resolve(), { timeout: 50 });
      } else {
        setTimeout(() => resolve(), 0);
      }
    });
  }
  return results;
}

// Calculate sheet details progressively
async function calculateSheetDetails() {
  if (!store.setDetail?.booster || !selectedBoosterType.value) {
    sheetDetailsData.value = [];
    return;
  }

  sheetDetailsLoading.value = true;
  const boosterConfig = store.setDetail.booster[selectedBoosterType.value];
  if (!boosterConfig) {
    sheetDetailsData.value = [];
    sheetDetailsLoading.value = false;
    return;
  }

  const sheets = boosterConfig.sheets ?? {};
  const details = [];

  // Process sheets one by one
  const sheetEntries = Object.entries(sheets);
  for (let i = 0; i < sheetEntries.length; i++) {
    const [sheetName, sheetConfig] = sheetEntries[i];
    const cards = sheetConfig.cards ?? {};
    const totalWeight =
      sheetConfig.totalWeight ?? Object.values(cards).reduce((sum, weight) => sum + weight, 0);

    const cardDetails = [];
    let sheetEV = 0;
    let currency = null;

    // Process cards in chunks of 50
    const cardEntries = Object.entries(cards);
    const chunkSize = 50;
    
    for (let j = 0; j < cardEntries.length; j += chunkSize) {
      const chunk = cardEntries.slice(j, j + chunkSize);
      
      chunk.forEach(([uuid, weight]) => {
        const cardInfo = store.identifierIndex[uuid];
        const priceNode = store.priceIndex[uuid];
        // CRITICAL: Pass explicit 'normal' for non-foil sheets to avoid foil price fallback
        const price = pickLatestPrice(priceNode, {
          preferredFinish: sheetConfig.foil ? 'foil' : 'normal',
        });

        const cardValue = price?.value && price.value >= evMinPrice.value ? price.value : 0;
        const probability = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
        const contribution = cardValue ? probability * (cardValue / 100) : 0;
        sheetEV += contribution;

        if (!currency && price?.currency) currency = price.currency;

        cardDetails.push({
          uuid,
          name: cardInfo?.name ?? 'Unknown',
          number: cardInfo?.number ?? 'N/A',
          rarity: cardInfo?.rarity ?? 'unknown',
          weight,
          probability,
          price: price?.value ?? null,
          cardValue,
          currency: price?.currency ?? 'USD',
          contribution,
          vendor: price?.vendor ?? 'N/A',
        });
      });

      // Yield to browser every chunk
      if (j + chunkSize < cardEntries.length) {
        await new Promise((resolve) => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => resolve(), { timeout: 50 });
          } else {
            setTimeout(() => resolve(), 0);
          }
        });
      }
    }

    cardDetails.sort((a, b) => b.contribution - a.contribution);

    details.push({
      sheetName,
      foil: sheetConfig.foil ?? false,
      totalWeight,
      cardCount: Object.keys(cards).length,
      cardDetails,
      sheetEV,
      currency: currency ?? 'USD',
    });

    // Update data progressively
    sheetDetailsData.value = [...details].sort((a, b) => b.sheetEV - a.sheetEV);
    
    // Yield between sheets
    if (i < sheetEntries.length - 1) {
      await new Promise((resolve) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          setTimeout(() => resolve(), 0);
        }
      });
    }
  }

  sheetDetailsData.value = details.sort((a, b) => b.sheetEV - a.sheetEV);
  sheetDetailsLoading.value = false;
}

// Use computed for backward compatibility but trigger async calculation
const sheetDetails = computed(() => sheetDetailsData.value);

// Calculate layout details progressively
async function calculateLayoutDetails() {
  if (!store.setDetail?.booster || !selectedBoosterType.value || !sheetDetailsData.value.length) {
    layoutDetailsData.value = [];
    return;
  }

  layoutDetailsLoading.value = true;
  const boosterConfig = store.setDetail.booster[selectedBoosterType.value];
  if (!boosterConfig) {
    layoutDetailsData.value = [];
    layoutDetailsLoading.value = false;
    return;
  }

  const layouts = boosterConfig.boosters ?? [];
  const totalWeight = boosterConfig.boostersTotalWeight ?? layouts.reduce(
    (sum, layout) => sum + (layout.weight ?? 1),
    0,
  );

  const details = [];

  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i];
    const contents = layout.contents ?? {};
    const weight = layout.weight ?? 1;
    const probability = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;

    let layoutEV = 0;
    const sheetContributions = [];

    Object.entries(contents).forEach(([sheetName, qty]) => {
      const sheetDetail = sheetDetailsData.value.find((s) => s.sheetName === sheetName);
      if (sheetDetail) {
        const contribution = qty * sheetDetail.sheetEV;
        layoutEV += contribution;
        sheetContributions.push({
          sheetName,
          quantity: qty,
          sheetEV: sheetDetail.sheetEV,
          contribution,
        });
      }
    });

    details.push({
      index: i + 1,
      weight,
      probability,
      contents,
      sheetContributions,
      layoutEV,
      currency: sheetDetailsData.value[0]?.currency ?? 'USD',
    });

    // Update progressively
    layoutDetailsData.value = [...details].sort((a, b) => b.probability - a.probability);

    // Yield between layouts
    if (i < layouts.length - 1) {
      await new Promise((resolve) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          setTimeout(() => resolve(), 0);
        }
      });
    }
  }

  layoutDetailsData.value = details.sort((a, b) => b.probability - a.probability);
  layoutDetailsLoading.value = false;
}

const layoutDetails = computed(() => layoutDetailsData.value);

// EV total du booster
const boosterEV = computed(() => {
  if (layoutDetails.value.length === 0) return 0;
  const totalEV = layoutDetails.value.reduce(
    (sum, layout) => sum + layout.layoutEV * (layout.probability / 100),
    0,
  );
  return totalEV;
});

// Calculate detailed calculations progressively
async function calculateDetailedCalculations() {
  if (!sheetDetailsData.value.length) {
    detailedCalculationsData.value = [];
    return;
  }

  detailedCalculationsLoading.value = true;
  const calculations = [];

  // Process sheets one by one
  for (let i = 0; i < sheetDetailsData.value.length; i++) {
    const sheet = sheetDetailsData.value[i];
    
    // Process cards in chunks
    const chunkSize = 100;
    for (let j = 0; j < sheet.cardDetails.length; j += chunkSize) {
      const chunk = sheet.cardDetails.slice(j, j + chunkSize);
      
      chunk.forEach((card) => {
        calculations.push({
          sheetName: sheet.sheetName,
          sheetFoil: sheet.foil,
          sheetTotalWeight: sheet.totalWeight,
          sheetEV: sheet.sheetEV,
          sheetCurrency: sheet.currency,
          cardName: card.name,
          cardNumber: card.number,
          cardRarity: card.rarity,
          cardUUID: card.uuid,
          cardWeight: card.weight,
          cardProbability: card.probability,
          cardPrice: card.price,
          cardValue: card.cardValue,
          cardCurrency: card.currency,
          cardContribution: card.contribution,
          cardVendor: card.vendor,
          calculationStep1: `${card.weight} / ${sheet.totalWeight} = ${(card.weight / sheet.totalWeight).toFixed(6)}`,
          calculationStep2: `${(card.weight / sheet.totalWeight).toFixed(6)} × 100 = ${card.probability.toFixed(4)}%`,
          calculationStep3: card.cardValue > 0 
            ? `${card.probability.toFixed(4)}% × ${card.cardValue.toFixed(2)}€ = ${card.contribution.toFixed(6)}€`
            : `0€ (price ${card.price ? `< ${evMinPrice.value}€` : 'N/A'})`,
        });
      });

      // Update progressively
      detailedCalculationsData.value = [...calculations].sort((a, b) => b.cardContribution - a.cardContribution);

      // Yield between chunks
      if (j + chunkSize < sheet.cardDetails.length || i < sheetDetailsData.value.length - 1) {
        await new Promise((resolve) => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => resolve(), { timeout: 50 });
          } else {
            setTimeout(() => resolve(), 0);
          }
        });
      }
    }
  }

  detailedCalculationsData.value = calculations.sort((a, b) => b.cardContribution - a.cardContribution);
  detailedCalculationsLoading.value = false;
}

const detailedCalculations = computed(() => detailedCalculationsData.value);

// Calculate layout calculations progressively
async function calculateLayoutCalculations() {
  if (!layoutDetailsData.value.length) {
    layoutCalculationsData.value = [];
    return;
  }

  layoutCalculationsLoading.value = true;
  const calculations = [];

  for (let i = 0; i < layoutDetailsData.value.length; i++) {
    const layout = layoutDetailsData.value[i];
    
    layout.sheetContributions.forEach((contribution) => {
      calculations.push({
        layoutIndex: layout.index,
        layoutWeight: layout.weight,
        layoutProbability: layout.probability,
        layoutEV: layout.layoutEV,
        layoutCurrency: layout.currency,
        sheetName: contribution.sheetName,
        sheetQuantity: contribution.quantity,
        sheetEV: contribution.sheetEV,
        contribution: contribution.contribution,
        calculation: `${contribution.quantity} × ${contribution.sheetEV.toFixed(2)}€ = ${contribution.contribution.toFixed(2)}€`,
      });
    });

    // Update progressively
    layoutCalculationsData.value = [...calculations];

    // Yield between layouts
    if (i < layoutDetailsData.value.length - 1) {
      await new Promise((resolve) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          setTimeout(() => resolve(), 0);
        }
      });
    }
  }

  layoutCalculationsData.value = calculations;
  layoutCalculationsLoading.value = false;
}

const layoutCalculations = computed(() => layoutCalculationsData.value);

// Final booster EV calculation breakdown
const boosterEVBreakdown = computed(() => {
  if (!layoutDetails.value.length) return null;

  const totalWeight = layoutDetails.value.reduce((sum, layout) => sum + layout.weight, 0);
  const currency = layoutDetails.value[0]?.currency ?? 'USD';

  const breakdown = layoutDetails.value.map((layout) => ({
    layoutIndex: layout.index,
    layoutWeight: layout.weight,
    layoutProbability: layout.probability,
    layoutEV: layout.layoutEV,
    weightedContribution: layout.layoutEV * (layout.probability / 100),
    calculation: `${layout.layoutEV.toFixed(2)}€ × ${layout.probability.toFixed(2)}% = ${(layout.layoutEV * (layout.probability / 100)).toFixed(4)}€`,
  }));

  const totalEV = breakdown.reduce((sum, item) => sum + item.weightedContribution, 0);

  return {
    breakdown,
    totalWeight,
    totalEV,
    currency,
    finalCalculation: breakdown.map(b => b.calculation).join(' + ') + ` = ${totalEV.toFixed(2)}€`,
  };
});

// Check if a card is exclusive to the selected booster type
function isCardExclusiveToBoosterType(cardUuid) {
  if (!store.setDetail?.booster) return false;
  
  const currentType = selectedBoosterType.value;
  let foundInCurrent = false;
  let foundInOther = false;
  
  Object.entries(store.setDetail.booster).forEach(([type, config]) => {
    const sheets = config.sheets ?? {};
    const foundInThisType = Object.values(sheets).some((sheet) => {
      return sheet.cards && sheet.cards[cardUuid];
    });
    
    if (foundInThisType) {
      if (type === currentType) {
        foundInCurrent = true;
      } else {
        foundInOther = true;
      }
    }
  });
  
  return foundInCurrent && !foundInOther;
}

// Get cards that appear in multiple booster types
const cardsInMultipleBoosters = computed(() => {
  if (!store.setDetail?.booster) return new Map();
  
  const cardLocations = new Map();
  
  Object.entries(store.setDetail.booster).forEach(([type, config]) => {
    const sheets = config.sheets ?? {};
    Object.entries(sheets).forEach(([sheetName, sheet]) => {
      const cards = sheet.cards ?? {};
      Object.keys(cards).forEach((uuid) => {
        if (!cardLocations.has(uuid)) {
          cardLocations.set(uuid, []);
        }
        cardLocations.get(uuid).push({ type, sheet: sheetName, foil: sheet.foil });
      });
    });
  });
  
  return cardLocations;
});

onMounted(async () => {
  await store.loadSetList();
  if (selectedSet.value) {
    await store.setSelectedSet(selectedSet.value);
    await store.ensureIdentifiers();
    await store.ensurePriceIndex();
  }
});

watch(
  () => selectedSet.value,
  (code) => {
    if (code) {
      store.setSelectedSet(code);
    }
  },
);

watch(
  () => store.setDetail,
  () => {
    if (store.setDetail && boosterTypes.value.length > 0) {
      if (!boosterTypes.value.includes(selectedBoosterType.value)) {
        selectedBoosterType.value = boosterTypes.value[0];
      }
    }
  },
  { immediate: true },
);

watch(
  () => [store.setDetail, selectedBoosterType.value, evMinPrice.value],
  async () => {
    if (store.setDetail && selectedBoosterType.value) {
      await store.ensureIdentifiers();
      await store.ensurePriceIndex();
      
      // Reset data
      sheetDetailsData.value = [];
      layoutDetailsData.value = [];
      detailedCalculationsData.value = [];
      layoutCalculationsData.value = [];
      
      // Calculate progressively
      await calculateSheetDetails();
      await calculateLayoutDetails();
      await calculateLayoutCalculations();
      // Calculate detailed tables only when needed (lazy)
    }
  },
);
</script>

<template>
  <div class="booster-details-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Booster Analysis</p>
        <h1>Detailed Booster Breakdown</h1>
        <p class="lead">
          Complete breakdown of cards, probabilities, prices, and expected values for each booster
          type.
        </p>
      </div>
    </header>

    <section class="controls">
      <ElCard shadow="never">
        <ElForm label-position="top" :inline="true" class="control-form">
          <ElFormItem label="Set">
            <ElSelect
              v-model="selectedSet"
              filterable
              placeholder="Choose a set"
              :loading="store.setListLoading"
              style="width: 200px"
            >
              <ElOption
                v-for="set in setOptions"
                :key="set.code"
                :label="`${set.name} (${set.code.toUpperCase()})`"
                :value="set.code"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="Booster Type" v-if="boosterTypes.length">
            <ElSelect
              v-model="selectedBoosterType"
              placeholder="Choose booster type"
              style="width: 200px"
            >
              <ElOption
                v-for="type in boosterTypes"
                :key="type"
                :label="type"
                :value="type"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="Minimum card price for EV (EUR)">
            <ElInputNumber
              v-model="evMinPrice"
              :min="0"
              :step="0.1"
              :precision="2"
              controls-position="right"
              style="width: 200px"
            />
          </ElFormItem>
        </ElForm>
      </ElCard>
    </section>

    <template v-if="isLoading">
      <ElSkeleton :rows="10" animated />
    </template>

    <template v-else-if="store.detailError">
      <ElAlert :title="store.detailError" type="error" show-icon />
    </template>

    <template v-else-if="!setDetail">
      <ElEmpty description="Select a set to view booster details." />
    </template>

    <template v-else>
      <!-- Set Info -->
      <section class="set-info">
        <ElCard shadow="never">
          <template v-if="sheetDetailsLoading && !sheetDetails.length">
            <ElSkeleton :rows="3" animated />
          </template>
          <div v-else class="set-header">
            <div>
              <ElTag type="info" size="large">{{ setDetail.code }}</ElTag>
              <h2>{{ setDetail.name }}</h2>
              <p class="meta">
                Release Date: <strong>{{ setDetail.releaseDate ?? 'N/A' }}</strong> | Total Cards:
                <strong>{{ setDetail.cards?.length ?? 0 }}</strong>
              </p>
            </div>
            <div class="ev-summary">
              <div class="ev-box">
                <span class="ev-label">{{ selectedBoosterType }} Booster EV</span>
                <span class="ev-value">
                  {{ boosterEV.toFixed(2) }} {{ sheetDetails[0]?.currency ?? 'USD' }}
                </span>
              </div>
            </div>
          </div>
        </ElCard>
      </section>

      <!-- Layouts Overview -->
      <section class="layouts-section">
        <ElCard shadow="never">
          <header class="card-head">
            <div>
              <h2>Booster Layouts</h2>
              <p>All possible booster configurations and their probabilities.</p>
              <ElTag v-if="layoutDetailsLoading" type="warning" size="small" style="margin-top: 0.5rem">
                Loading layouts...
              </ElTag>
            </div>
          </header>

          <template v-if="layoutDetailsLoading">
            <ElSkeleton :rows="5" animated />
          </template>
          <ElTable v-else :data="layoutDetails" stripe>
            <ElTableColumn prop="index" label="#" width="60" />
            <ElTableColumn label="Probability" width="120">
              <template #default="scope">
                {{ scope.row.probability.toFixed(2) }}%
              </template>
            </ElTableColumn>
            <ElTableColumn label="Weight" width="100">
              <template #default="scope">
                {{ scope.row.weight }}
              </template>
            </ElTableColumn>
            <ElTableColumn label="Contents" min-width="300">
              <template #default="scope">
                <div class="contents-list">
                  <ElTag
                    v-for="(qty, sheetName) in scope.row.contents"
                    :key="sheetName"
                    style="margin-right: 0.5rem; margin-bottom: 0.25rem"
                  >
                    {{ qty }}× {{ sheetName }}
                  </ElTag>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="Layout EV" width="140">
              <template #default="scope">
                <strong>{{ scope.row.layoutEV.toFixed(2) }} {{ scope.row.currency }}</strong>
              </template>
            </ElTableColumn>
            <ElTableColumn type="expand" width="60">
              <template #default="scope">
                <div class="layout-breakdown">
                  <h4>Sheet Contributions</h4>
                  <ElTable :data="scope.row.sheetContributions" size="small">
                    <ElTableColumn prop="sheetName" label="Sheet" />
                    <ElTableColumn prop="quantity" label="Qty" width="80" />
                    <ElTableColumn label="Sheet EV" width="120">
                      <template #default="sheet">
                        {{ sheet.row.sheetEV.toFixed(2) }} {{ scope.row.currency }}
                      </template>
                    </ElTableColumn>
                    <ElTableColumn label="Contribution" width="140">
                      <template #default="sheet">
                        <strong>
                          {{ sheet.row.contribution.toFixed(2) }} {{ scope.row.currency }}
                        </strong>
                      </template>
                    </ElTableColumn>
                  </ElTable>
                </div>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </section>

      <!-- Sheets Details -->
      <section class="sheets-section">
        <ElCard shadow="never">
          <header class="card-head">
            <div>
              <h2>Sheet Details</h2>
              <p>Complete breakdown of each sheet with cards, weights, probabilities, and prices.</p>
              <ElTag v-if="sheetDetailsLoading" type="warning" size="small" style="margin-top: 0.5rem">
                Loading sheets...
              </ElTag>
            </div>
          </header>

          <template v-if="sheetDetailsLoading">
            <ElSkeleton :rows="5" animated />
          </template>
          <ElCollapse v-else>
            <ElCollapseItem
              v-for="sheet in sheetDetails"
              :key="sheet.sheetName"
              :name="sheet.sheetName"
            >
              <template #title>
                <div class="sheet-header">
                  <div>
                    <strong>{{ sheet.sheetName }}</strong>
                    <ElTag v-if="sheet.foil" type="warning" size="small" style="margin-left: 0.5rem">
                      Foil
                    </ElTag>
                  </div>
                  <div class="sheet-meta">
                    <span>{{ sheet.cardCount }} cards</span>
                    <span>|</span>
                    <span>Total Weight: {{ sheet.totalWeight }}</span>
                    <span>|</span>
                    <strong>EV: {{ sheet.sheetEV.toFixed(2) }} {{ sheet.currency }}</strong>
                  </div>
                </div>
              </template>

              <div class="sheet-content">
                <ElTable :data="sheet.cardDetails" stripe max-height="500">
                  <ElTableColumn prop="number" label="#" width="80" />
                  <ElTableColumn prop="name" label="Card Name" min-width="200">
                    <template #default="scope">
                      <div>
                        {{ scope.row.name }}
                        <ElTag
                          v-if="isCardExclusiveToBoosterType(scope.row.uuid)"
                          type="warning"
                          size="small"
                          style="margin-left: 0.5rem"
                        >
                          {{ selectedBoosterType }} only
                        </ElTag>
                      </div>
                    </template>
                  </ElTableColumn>
                  <ElTableColumn prop="rarity" label="Rarity" width="100">
                    <template #default="scope">
                      <ElTag>{{ scope.row.rarity }}</ElTag>
                    </template>
                  </ElTableColumn>
                  <ElTableColumn prop="weight" label="Weight" width="100" />
                  <ElTableColumn label="Probability" width="120">
                    <template #default="scope">
                      {{ scope.row.probability.toFixed(4) }}%
                    </template>
                  </ElTableColumn>
                  <ElTableColumn label="Price" width="120">
                    <template #default="scope">
                      <span v-if="scope.row.price">
                        {{ scope.row.price.toFixed(2) }} {{ scope.row.currency }}
                        <ElTag
                          v-if="scope.row.cardValue === 0 && scope.row.price < evMinPrice"
                          size="small"
                          type="warning"
                          style="margin-left: 0.25rem"
                        >
                          &lt; {{ evMinPrice }}€
                        </ElTag>
                      </span>
                      <span v-else class="no-price">N/A</span>
                    </template>
                  </ElTableColumn>
                  <ElTableColumn prop="vendor" label="Vendor" width="120">
                    <template #default="scope">
                      <ElTag type="info" size="small">{{ scope.row.vendor }}</ElTag>
                    </template>
                  </ElTableColumn>
                  <ElTableColumn label="Contribution" width="140">
                    <template #default="scope">
                      <strong>
                        {{ scope.row.contribution.toFixed(4) }} {{ scope.row.currency }}
                      </strong>
                    </template>
                  </ElTableColumn>
                </ElTable>

                <div class="sheet-summary">
                  <div class="summary-item">
                    <span class="label">Total Cards:</span>
                    <span class="value">{{ sheet.cardCount }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">Total Weight:</span>
                    <span class="value">{{ sheet.totalWeight }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">Cards with Price:</span>
                    <span class="value">
                      {{ sheet.cardDetails.filter((c) => c.price).length }}
                    </span>
                  </div>
                  <div class="summary-item highlight">
                    <span class="label">Sheet EV:</span>
                    <span class="value">
                      {{ sheet.sheetEV.toFixed(2) }} {{ sheet.currency }}
                    </span>
                  </div>
                </div>
              </div>
            </ElCollapseItem>
          </ElCollapse>
        </ElCard>
      </section>

      <!-- Detailed Calculations Table -->
      <section class="detailed-calculations-section">
        <ElCard shadow="never">
          <header class="card-head">
            <div>
              <h2>Detailed Calculation Breakdown</h2>
              <p>
                Complete step-by-step calculations showing every card, probability, price, and contribution
                to the final booster EV.
              </p>
              <div style="margin-top: 0.5rem;">
                <ElTag v-if="detailedCalculationsLoading" type="warning" size="small">
                  Loading calculations...
                </ElTag>
                <ElTag v-else-if="detailedCalculations.length > 0" type="success" size="small">
                  {{ detailedCalculations.length }} cards loaded
                </ElTag>
              </div>
            </div>
            <div>
              <ElButton
                v-if="!detailedCalculationsLoading && detailedCalculations.length === 0 && sheetDetails.length > 0"
                type="primary"
                size="small"
                @click="calculateDetailedCalculations"
              >
                Load Detailed Calculations
              </ElButton>
            </div>
          </header>

          <ElDivider />

          <!-- Card-level calculations -->
          <div class="calculation-section">
            <h3>Card-Level Calculations (All Sheets)</h3>
            <p class="section-description">
              This table shows every card in every sheet with its individual calculation:
              <code>contribution = probability × card_price</code>
            </p>
            <template v-if="detailedCalculationsLoading">
              <ElSkeleton :rows="10" animated style="margin-top: 1rem" />
            </template>
            <ElTable
              v-else-if="detailedCalculations.length > 0"
              :data="detailedCalculations"
              stripe
              max-height="600"
              style="margin-top: 1rem"
            >
              <ElTableColumn prop="sheetName" label="Sheet" width="150" fixed="left">
                <template #default="scope">
                  <div>
                    <strong>{{ scope.row.sheetName }}</strong>
                    <ElTag v-if="scope.row.sheetFoil" type="warning" size="small" style="margin-left: 0.5rem">
                      Foil
                    </ElTag>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="cardNumber" label="#" width="80" />
              <ElTableColumn prop="cardName" label="Card Name" min-width="200">
                <template #default="scope">
                  <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div>
                      {{ scope.row.cardName }}
                      <ElTag
                        v-if="isCardExclusiveToBoosterType(scope.row.cardUUID)"
                        type="warning"
                        size="small"
                        style="margin-left: 0.5rem"
                      >
                        {{ selectedBoosterType }} only
                      </ElTag>
                    </div>
                    <div v-if="cardsInMultipleBoosters.get(scope.row.cardUUID)?.length > 1" style="font-size: 0.75rem; color: #6b7280;">
                      Also in:
                      <ElTag
                        v-for="location in cardsInMultipleBoosters.get(scope.row.cardUUID).filter(l => l.type !== selectedBoosterType)"
                        :key="`${location.type}-${location.sheet}`"
                        type="info"
                        size="small"
                        style="margin-left: 0.25rem"
                      >
                        {{ location.type }} ({{ location.foil ? 'foil' : 'normal' }})
                      </ElTag>
                    </div>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="cardRarity" label="Rarity" width="100">
                <template #default="scope">
                  <ElTag size="small">{{ scope.row.cardRarity }}</ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="cardWeight" label="Weight" width="100" />
              <ElTableColumn prop="sheetTotalWeight" label="Sheet Total Weight" width="140" />
              <ElTableColumn label="Probability" width="140">
                <template #default="scope">
                  <div>
                    <div>{{ scope.row.cardProbability.toFixed(4) }}%</div>
                    <div class="calculation-hint">{{ scope.row.calculationStep2 }}</div>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn label="Price" width="140">
                <template #default="scope">
                  <div v-if="scope.row.cardPrice">
                    <div>
                      {{ scope.row.cardPrice.toFixed(2) }} {{ scope.row.cardCurrency }}
                    </div>
                    <ElTag
                      v-if="scope.row.cardValue === 0"
                      size="small"
                      type="warning"
                      style="margin-top: 0.25rem"
                    >
                      &lt; {{ evMinPrice }}€
                    </ElTag>
                  </div>
                  <span v-else class="no-price">N/A</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="Card Value" width="120">
                <template #default="scope">
                  <strong>
                    {{ scope.row.cardValue.toFixed(2) }} {{ scope.row.cardCurrency }}
                  </strong>
                </template>
              </ElTableColumn>
              <ElTableColumn label="Contribution" width="180">
                <template #default="scope">
                  <div>
                    <strong>
                      {{ scope.row.cardContribution.toFixed(6) }} {{ scope.row.cardCurrency }}
                    </strong>
                    <div class="calculation-hint">{{ scope.row.calculationStep3 }}</div>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="cardVendor" label="Vendor" width="120">
                <template #default="scope">
                  <ElTag type="info" size="small">{{ scope.row.cardVendor }}</ElTag>
                </template>
              </ElTableColumn>
              </ElTable>
            <ElEmpty v-else description="Click 'Load Detailed Calculations' to see all card calculations" style="margin-top: 2rem" />

            <div v-if="detailedCalculations.length > 0" class="calculation-summary">
              <div class="summary-row">
                <span class="label">Total Cards:</span>
                <span class="value">{{ detailedCalculations.length }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Cards with Price:</span>
                <span class="value">
                  {{ detailedCalculations.filter((c) => c.cardPrice).length }}
                </span>
              </div>
              <div class="summary-row">
                <span class="label">Cards Contributing to EV:</span>
                <span class="value">
                  {{ detailedCalculations.filter((c) => c.cardContribution > 0).length }}
                </span>
              </div>
              <div class="summary-row highlight">
                <span class="label">Total Sheet EV Sum:</span>
                <span class="value">
                  {{
                    sheetDetails.reduce((sum, sheet) => sum + sheet.sheetEV, 0).toFixed(2)
                  }}
                  {{ sheetDetails[0]?.currency ?? 'USD' }}
                </span>
              </div>
            </div>
          </div>

          <ElDivider />

          <!-- Layout-level calculations -->
          <div class="calculation-section">
            <h3>Layout-Level Calculations</h3>
            <p class="section-description">
              This table shows how each layout's EV is calculated:
              <code>layout_EV = Σ (quantity × sheet_EV)</code>
            </p>
            <template v-if="layoutCalculationsLoading">
              <ElSkeleton :rows="5" animated style="margin-top: 1rem" />
            </template>
            <ElTable
              v-else-if="layoutCalculations.length > 0"
              :data="layoutCalculations"
              stripe
              max-height="400"
              style="margin-top: 1rem"
            >
              <ElTableColumn prop="layoutIndex" label="Layout #" width="100" />
              <ElTableColumn label="Layout Info" width="200">
                <template #default="scope">
                  <div>
                    <div>Weight: {{ scope.row.layoutWeight }}</div>
                    <div>Probability: {{ scope.row.layoutProbability.toFixed(2) }}%</div>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="sheetName" label="Sheet" width="150" />
              <ElTableColumn prop="sheetQuantity" label="Quantity" width="100" />
              <ElTableColumn label="Sheet EV" width="120">
                <template #default="scope">
                  {{ scope.row.sheetEV.toFixed(2) }} {{ scope.row.layoutCurrency }}
                </template>
              </ElTableColumn>
              <ElTableColumn label="Contribution" width="200">
                <template #default="scope">
                  <div>
                    <strong>
                      {{ scope.row.contribution.toFixed(2) }} {{ scope.row.layoutCurrency }}
                    </strong>
                    <div class="calculation-hint">{{ scope.row.calculation }}</div>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn label="Layout Total EV" width="150">
                <template #default="scope">
                  <strong>
                    {{ scope.row.layoutEV.toFixed(2) }} {{ scope.row.layoutCurrency }}
                  </strong>
                </template>
              </ElTableColumn>
            </ElTable>
          </div>

          <ElDivider />

          <!-- Final booster EV calculation -->
          <div class="calculation-section">
            <h3>Final Booster EV Calculation</h3>
            <p class="section-description">
              Weighted average across all layouts:
              <code>booster_EV = Σ (layout_EV × layout_probability)</code>
            </p>
            <template v-if="layoutDetailsLoading">
              <ElSkeleton :rows="5" animated style="margin-top: 1rem" />
            </template>
            <template v-else-if="boosterEVBreakdown">
              <ElTable
                :data="boosterEVBreakdown.breakdown"
                stripe
                style="margin-top: 1rem"
              >
                <ElTableColumn prop="layoutIndex" label="Layout #" width="100" />
                <ElTableColumn label="Layout EV" width="120">
                  <template #default="scope">
                    {{ scope.row.layoutEV.toFixed(2) }} {{ boosterEVBreakdown.currency }}
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Probability" width="120">
                  <template #default="scope">
                    {{ scope.row.layoutProbability.toFixed(2) }}%
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Weighted Contribution" width="200">
                  <template #default="scope">
                    <div>
                      <strong>
                        {{ scope.row.weightedContribution.toFixed(4) }}
                        {{ boosterEVBreakdown.currency }}
                      </strong>
                      <div class="calculation-hint">{{ scope.row.calculation }}</div>
                    </div>
                  </template>
                </ElTableColumn>
              </ElTable>

              <div class="final-calculation-box">
                <div class="final-calculation-header">
                  <h4>Final Calculation</h4>
                </div>
                <div class="final-calculation-formula">
                  <div class="formula-line">
                    <code>{{ boosterEVBreakdown.finalCalculation }}</code>
                  </div>
                  <div class="formula-result">
                    <span class="result-label">Booster EV =</span>
                    <span class="result-value">
                      {{ boosterEVBreakdown.totalEV.toFixed(2) }} {{ boosterEVBreakdown.currency }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <ElEmpty v-else description="Layouts are required to compute the booster EV." style="margin-top: 1rem" />
          </div>
        </ElCard>
      </section>
    </template>
  </div>
</template>

<style scoped>
.booster-details-page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.page-header {
  margin-bottom: 1rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.75rem;
  color: #7c8794;
  margin: 0;
}

.page-header h1 {
  margin: 0.5rem 0;
  font-size: 2rem;
  color: #1f2937;
}

.lead {
  color: #6b7280;
  margin: 0;
}

.controls {
  margin-bottom: 1rem;
}

.control-form {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.set-info {
  margin-bottom: 1rem;
}

.set-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  flex-wrap: wrap;
}

.set-header h2 {
  margin: 0.5rem 0;
  font-size: 1.5rem;
}

.meta {
  color: #6b7280;
  margin: 0.5rem 0 0;
}

.ev-summary {
  display: flex;
  gap: 1rem;
}

.ev-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: white;
}

.ev-label {
  font-size: 0.85rem;
  opacity: 0.9;
}

.ev-value {
  font-size: 1.8rem;
  font-weight: bold;
  margin-top: 0.25rem;
}

.card-head {
  margin-bottom: 1.5rem;
}

.card-head h2 {
  margin: 0;
  font-size: 1.5rem;
}

.card-head p {
  margin: 0.5rem 0 0;
  color: #6b7280;
}

.contents-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.layout-breakdown {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 8px;
}

.layout-breakdown h4 {
  margin: 0 0 1rem;
  color: #1f2937;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;
  gap: 1rem;
}

.sheet-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  color: #6b7280;
  font-size: 0.9rem;
}

.sheet-content {
  padding: 1rem 0;
}

.sheet-summary {
  display: flex;
  gap: 2rem;
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 8px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-item .label {
  font-size: 0.85rem;
  color: #6b7280;
}

.summary-item .value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.summary-item.highlight .value {
  color: #10b981;
  font-size: 1.3rem;
}

.no-price {
  color: #9ca3af;
  font-style: italic;
}

.detailed-calculations-section {
  margin-top: 2rem;
}

.calculation-section {
  margin-bottom: 2rem;
}

.calculation-section h3 {
  margin: 0 0 0.5rem;
  font-size: 1.3rem;
  color: #1f2937;
}

.section-description {
  color: #6b7280;
  margin: 0 0 1rem;
  font-size: 0.9rem;
}

.section-description code {
  background: #f3f4f6;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
}

.calculation-hint {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
  font-family: 'Monaco', 'Courier New', monospace;
}

.calculation-summary {
  display: flex;
  gap: 2rem;
  margin-top: 1.5rem;
  padding: 1rem 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
  flex-wrap: wrap;
}

.summary-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-row .label {
  font-size: 0.85rem;
  color: #6b7280;
}

.summary-row .value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.summary-row.highlight .value {
  color: #10b981;
  font-size: 1.3rem;
}

.final-calculation-box {
  margin-top: 2rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
}

.final-calculation-header {
  margin-bottom: 1rem;
}

.final-calculation-header h4 {
  margin: 0;
  font-size: 1.2rem;
  color: white;
}

.final-calculation-formula {
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem;
  border-radius: 8px;
}

.formula-line {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  opacity: 0.9;
  word-break: break-all;
}

.formula-line code {
  color: white;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.5rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Courier New', monospace;
}

.formula-result {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
}

.result-label {
  font-size: 1.1rem;
  opacity: 0.9;
}

.result-value {
  font-size: 2rem;
  font-weight: bold;
}

@media (max-width: 768px) {
  .set-header {
    flex-direction: column;
  }

  .ev-box {
    align-items: flex-start;
  }

  .sheet-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .sheet-summary {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>


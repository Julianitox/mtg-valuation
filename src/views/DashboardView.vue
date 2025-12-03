<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  ElAlert,
  ElButton,
  ElCard,
  ElDivider,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInputNumber,
  ElOption,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSkeleton,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { RefreshRight, Search } from '@element-plus/icons-vue';
import { RouterLink } from 'vue-router';
import { useMtgStore } from '../stores/mtgStore.js';

const store = useMtgStore();
const boosterChoice = ref('');
const evMinPrice = ref(0);
const rankingYearsBack = ref(3);

const selectedSet = computed({
  get: () => store.selectedSetCode,
  set: (value) => {
    store.setSelectedSet(value);
  },
});

const setOptions = computed(() => store.setOptions);

const boosterTypes = computed(() => store.boosterTypes);
const rarityRows = computed(() => {
  const stats = store.cardStats;
  return Object.entries(stats.rarities ?? {}).map(([rarity, count]) => ({
    rarity,
    count,
    ratio: stats.total ? ((count / stats.total) * 100).toFixed(1) : '0.0',
  }));
});

const valuationsWithPrices = computed(() =>
  store.boosterValuations.map((entry) => {
    const actualPrices = entry.boosterPrices ?? [];
    const trendPrice = store.getTrendPrice(store.selectedSetCode, entry.boosterType);
    const primaryPrice = actualPrices[0]?.value ?? trendPrice ?? null;
    return {
      ...entry,
      primaryPrice,
      allPrices: actualPrices,
      hasActualPrices: actualPrices.length > 0,
      hasTrendPrice: trendPrice !== null,
      diff: primaryPrice !== null ? entry.averageValue - primaryPrice : null,
    };
  }),
);

onMounted(() => {
  store.loadSetList();
});

watch(
  () => [store.setDetail?.code, evMinPrice.value],
  ([code]) => {
    if (code) {
      store.computeBoosterValuations({ minPrice: evMinPrice.value });
    }
  },
  { immediate: true },
);

watch(
  () => [rankingYearsBack.value, evMinPrice.value],
  () => {
    store.loadBoosterRanking({
      yearsBack: rankingYearsBack.value,
      minPrice: evMinPrice.value,
    });
  },
  { immediate: true },
);

watch(
  boosterTypes,
  (types) => {
    if (!types.length) {
      boosterChoice.value = '';
      return;
    }
    if (!types.includes(boosterChoice.value)) {
      boosterChoice.value = types.includes('draft') ? 'draft' : types[0];
    }
  },
  { immediate: true },
);
</script>

<template>
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">MTG Valuation Lab</p>
        <h1>Identify the most profitable sets</h1>
        <p class="lead">
          MTGJSON dumps are fetched once and cached in <strong>localStorage</strong>. Refresh only when you need fresh data.
        </p>
      </div>
    </header>

    <section class="global-params">
      <ElCard shadow="never">
        <header class="card-head">
          <div>
            <h2>Global Parameters</h2>
            <p>Settings that apply to booster ranking and EV calculations.</p>
          </div>
        </header>
        <ElForm label-position="top" class="param-form">
          <ElFormItem label="Minimum card price for EV (EUR)">
            <ElInputNumber
              v-model="evMinPrice"
              :min="0"
              :step="0.1"
              controls-position="right"
            />
          </ElFormItem>
          <ElFormItem label="Ranking window (years)">
            <ElInputNumber
              v-model="rankingYearsBack"
              :min="1"
              :max="10"
              controls-position="right"
            />
          </ElFormItem>
        </ElForm>
      </ElCard>
    </section>

    <section class="ranking">
      <ElCard shadow="never">
        <header class="card-head">
          <div>
            <h2>Booster ranking</h2>
            <p>Compare expected value to trend prices for play, draft, and set boosters in recent sets.</p>
          </div>
        </header>
        <template v-if="store.playBoosterRankingLoading">
          <ElSkeleton :rows="6" animated />
        </template>
        <template v-else-if="store.playBoosterRankingError">
          <ElAlert :title="store.playBoosterRankingError" type="error" show-icon />
        </template>
        <template v-else>
          <div class="ranking-stack">
            <div class="ranking-block">
              <h3>Top 10 bargains</h3>
              <ElTable :data="store.playBoosterTop" height="420" stripe>
                <ElTableColumn prop="code" label="Set" width="90" />
                <ElTableColumn prop="name" label="Name" min-width="200" />
                <ElTableColumn prop="boosterType" label="Type" width="100">
                  <template #default="scope">
                    <ElTag>{{ scope.row.boosterType }}</ElTag>
                  </template>
                </ElTableColumn>
                <ElTableColumn prop="releaseDate" label="Release" width="120" />
                <ElTableColumn label="EV" width="120">
                  <template #default="scope">
                    {{ scope.row.expectedValue.toFixed(2) }} {{ scope.row.currency }}
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Booster price" width="180">
                  <template #default="scope">
                    <div v-if="scope.row.boosterPrices?.length" class="price-cell">
                      <div class="primary-price">
                        {{ scope.row.trendPrice.toFixed(2) }} {{ scope.row.currency }}
                      </div>
                      <div v-if="scope.row.boosterPrices.length > 1" class="price-count">
                        +{{ scope.row.boosterPrices.length - 1 }} more
                      </div>
                    </div>
                    <span v-else-if="scope.row.trendPrice !== null" class="trend-price">{{ scope.row.trendPrice.toFixed(2) }} {{ scope.row.currency }}</span>
                    <span v-else class="trend-price">—</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Diff (EV - Price)" width="160">
                  <template #default="scope">
                    <span v-if="scope.row.diff !== null" :class="{ 'positive-diff': scope.row.diff > 0, 'negative-diff': scope.row.diff < 0 }">
                      {{ scope.row.diff.toFixed(2) }} {{ scope.row.currency }}
                    </span>
                    <span v-else>—</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Diff %" width="120">
                  <template #default="scope">
                    <span
                      v-if="scope.row.diffPercent !== null"
                      :class="{
                        'positive-diff': (scope.row.diffPercent ?? 0) > 1,
                        'negative-diff': (scope.row.diffPercent ?? 0) < 1
                      }"
                    >
                      {{ scope.row.diffPercent.toFixed(2) }}
                    </span>
                    <span v-else>—</span>
                  </template>
                </ElTableColumn>
              </ElTable>
            </div>
            <div class="ranking-block">
              <h3>Bottom 10 overvalued</h3>
              <ElTable :data="store.playBoosterBottom" height="420" stripe>
                <ElTableColumn prop="code" label="Set" width="90" />
                <ElTableColumn prop="name" label="Name" min-width="200" />
                <ElTableColumn prop="boosterType" label="Type" width="100">
                  <template #default="scope">
                    <ElTag>{{ scope.row.boosterType }}</ElTag>
                  </template>
                </ElTableColumn>
                <ElTableColumn prop="releaseDate" label="Release" width="120" />
                <ElTableColumn label="EV" width="120">
                  <template #default="scope">
                    {{ scope.row.expectedValue.toFixed(2) }} {{ scope.row.currency }}
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Booster price" width="180">
                  <template #default="scope">
                    <div v-if="scope.row.boosterPrices?.length" class="price-cell">
                      <div class="primary-price">
                        {{ scope.row.trendPrice.toFixed(2) }} {{ scope.row.currency }}
                      </div>
                      <div v-if="scope.row.boosterPrices.length > 1" class="price-count">
                        +{{ scope.row.boosterPrices.length - 1 }} more
                      </div>
                    </div>
                    <span v-else-if="scope.row.trendPrice !== null" class="trend-price">{{ scope.row.trendPrice.toFixed(2) }} {{ scope.row.currency }}</span>
                    <span v-else class="trend-price">—</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Diff (EV - Price)" width="160">
                  <template #default="scope">
                    <span v-if="scope.row.diff !== null" :class="{ 'positive-diff': scope.row.diff > 0, 'negative-diff': scope.row.diff < 0 }">
                      {{ scope.row.diff.toFixed(2) }} {{ scope.row.currency }}
                    </span>
                    <span v-else>—</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="Diff %" width="120">
                  <template #default="scope">
                    <span
                      v-if="scope.row.diffPercent !== null"
                      :class="{
                        'positive-diff': (scope.row.diffPercent ?? 0) > 1,
                        'negative-diff': (scope.row.diffPercent ?? 0) < 1
                      }"
                    >
                      {{ scope.row.diffPercent.toFixed(2) }}
                    </span>
                    <span v-else>—</span>
                  </template>
                </ElTableColumn>
              </ElTable>
            </div>
          </div>
        </template>
      </ElCard>
    </section>

    <section class="parameters">
      <ElCard shadow="never">
        <header class="card-head">
          <div>
            <h2>Query parameters</h2>
            <p>Pick a set, choose a booster type, and prepare ROI simulations.</p>
          </div>
          <ElButton
            size="large"
            :loading="store.setListLoading"
            @click="store.loadSetList({ force: true })"
          >
            <template #icon>
              <ElIcon>
                <RefreshRight />
              </ElIcon>
            </template>
            Refresh SetList
          </ElButton>
        </header>

        <ElForm label-position="top" class="param-form">
          <ElFormItem label="Select a set">
            <div class="set-select">
              <ElSelect
                v-model="selectedSet"
                filterable
                placeholder="Choose a set"
                :loading="store.setListLoading"
                clearable
              >
                <ElOption
                  v-for="set in setOptions"
                  :key="set.code"
                  :label="`${set.name} (${set.code.toUpperCase()})`"
                  :value="set.code"
                />
              </ElSelect>
              <ElTag type="info" v-if="store.selectedSetCode">
                {{ store.selectedSetCode.toUpperCase() }}
              </ElTag>
            </div>
            <template #error>
              <span v-if="store.setListError">{{ store.setListError }}</span>
            </template>
          </ElFormItem>

          <ElFormItem label="Booster type" v-if="boosterTypes.length">
            <ElRadioGroup v-model="boosterChoice" size="large">
              <ElRadioButton
                v-for="booster in boosterTypes"
                :key="booster"
                :label="booster"
              >
                {{ booster }}
              </ElRadioButton>
            </ElRadioGroup>
          </ElFormItem>

          <ElFormItem v-else label="Booster type">
            <ElEmpty description="Select a set to display available boosters." />
          </ElFormItem>

        </ElForm>
      </ElCard>
    </section>

    <section class="valuations">
      <ElCard shadow="never">
        <header class="card-head">
          <div>
            <h2>Booster expected value</h2>
            <p>Weighted average price per booster type based on MTGJSON sheet probabilities.</p>
          </div>
        </header>
        <ElAlert
          type="info"
          :closable="false"
          class="mb-3"
          title="How the EV is computed"
        >
          <template #default>
            <p>For each booster layout, we multiply the number of cards drawn from each sheet by the sheet's expected card price (Σ price × card weight / sheet weight). Cards priced below the configured minimum count as zero. The final booster EV is the average across layouts, weighted by their MTGJSON probabilities.</p>
            <p style="margin-top: 0.5rem;">
              <RouterLink to="/explanations" style="color: #409eff; text-decoration: none;">
                📖 View detailed step-by-step explanation →
              </RouterLink>
            </p>
          </template>
        </ElAlert>
        <template v-if="store.boosterValuationsLoading">
          <ElSkeleton :rows="5" animated />
        </template>
        <template v-else-if="store.boosterValuationsError">
          <ElAlert :title="store.boosterValuationsError" type="error" show-icon />
        </template>
        <template v-else-if="!valuationsWithPrices.length">
          <ElEmpty description="Select a set to compute booster valuations." />
        </template>
        <template v-else>
          <ElTable :data="valuationsWithPrices" stripe>
            <ElTableColumn type="expand">
              <template #default="scope">
                <div class="expand-content">
                  <div class="sheet-grid">
                    <article
                      v-for="(sheet, name) in scope.row.sheetBreakdown"
                      :key="name"
                      class="sheet-card"
                    >
                      <p class="sheet-title">
                        {{ name }}
                        <ElTag size="small" type="info" v-if="sheet.foil">Foil</ElTag>
                      </p>
                      <p class="meta">
                        Expected value per card:
                        <strong>{{ sheet.expectedValue.toFixed(2) }} {{ scope.row.currency }}</strong>
                      </p>
                      <p class="meta">Cards referenced: {{ sheet.cardCount }}</p>
                    </article>
                  </div>
                  <div v-if="scope.row.allPrices.length" class="booster-prices-section">
                    <h4>Booster prices</h4>
                    <div class="price-list">
                      <div
                        v-for="(price, idx) in scope.row.allPrices"
                        :key="idx"
                        class="price-item"
                      >
                        <ElTag type="success">{{ price.value.toFixed(2) }} {{ price.currency }}</ElTag>
                        <span class="price-meta">{{ price.vendor }} ({{ price.source }})</span>
                        <span class="price-date">{{ price.date }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-else class="booster-prices-section">
                    <p class="price-fallback">
                      No booster-specific prices found. Using trend price: {{ scope.row.primaryPrice.toFixed(2) }} {{ scope.row.currency }}
                    </p>
                    <p class="price-hint">
                      Update <code>public/trend-prices-config.json</code> to provide manual trend prices.
                    </p>
                  </div>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="boosterType" label="Booster type" min-width="160" />
            <ElTableColumn prop="averageValue" label="Expected value" width="160">
              <template #default="scope">
                {{ scope.row.averageValue.toFixed(2) }} {{ scope.row.currency }}
              </template>
            </ElTableColumn>
            <ElTableColumn label="Booster price" width="200">
              <template #default="scope">
                <div v-if="scope.row.hasActualPrices" class="price-cell">
                  <div class="primary-price">
                    {{ scope.row.primaryPrice.toFixed(2) }} {{ scope.row.currency }}
                  </div>
                  <div v-if="scope.row.allPrices.length > 1" class="price-count">
                    +{{ scope.row.allPrices.length - 1 }} more
                  </div>
                </div>
                <div v-else-if="scope.row.primaryPrice !== null" class="price-cell">
                  <span class="trend-price">{{ scope.row.primaryPrice.toFixed(2) }} {{ scope.row.currency }}</span>
                </div>
                <span v-else class="trend-price">—</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="EV - Price" width="150">
              <template #default="scope">
                <span v-if="scope.row.diff !== null" :class="{ 'positive-diff': scope.row.diff > 0, 'negative-diff': scope.row.diff < 0 }">
                  {{ scope.row.diff.toFixed(2) }} {{ scope.row.currency }}
                </span>
                <span v-else>—</span>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="layoutCount" label="# layouts" width="120" />
          </ElTable>
        </template>
      </ElCard>
    </section>

    <section class="detail">
      <ElCard shadow="never">
        <header class="card-head">
          <div>
            <h2>Set details</h2>
            <p>Rarity split, card volume, and booster availability.</p>
          </div>
        </header>
        <ElDivider />

        <template v-if="store.detailLoading">
          <ElSkeleton :rows="6" animated />
        </template>
        <template v-else-if="store.detailError">
          <ElAlert
            :title="store.detailError"
            type="error"
            show-icon
          />
        </template>
        <template v-else-if="!store.setDetail">
          <ElEmpty description="Pick a set to display its details." />
        </template>
        <template v-else>
          <div class="detail-head">
            <div>
              <p class="set-code">{{ store.setDetail.code }}</p>
              <h3>{{ store.setDetail.name }}</h3>
            </div>
            <div class="detail-meta">
              <p>Released on <strong>{{ store.setDetail.releaseDate ?? 'N/A' }}</strong></p>
              <p>Listed cards: <strong>{{ store.cardStats.total }}</strong></p>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stats-card">
              <p class="label">Rarity distribution</p>
              <div class="rarity-grid">
                <p
                  v-for="row in rarityRows"
                  :key="row.rarity"
                  class="rarity-row"
                >
                  <span class="rarity-label">{{ row.rarity }}</span>
                  <span>{{ row.count }} cards ({{ row.ratio }} %)</span>
                </p>
              </div>
            </div>
            <div class="stats-card">
              <p class="label">Selected booster</p>
              <p v-if="boosterChoice">
                Booster <strong>{{ boosterChoice }}</strong>. Probabilities and EV will be computed once sheet data is wired.
              </p>
              <ElEmpty v-else description="Pick a booster to continue." />
            </div>
          </div>
        </template>
      </ElCard>
    </section>
  </main>
</template>

<style scoped>
@import '../styles/dashboard.css';
</style>


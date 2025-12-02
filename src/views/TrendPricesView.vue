<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  ElAlert,
  ElCard,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInputNumber,
  ElTable,
  ElTableColumn,
  ElTag,
  ElMessage,
} from 'element-plus';
import { useMtgStore } from '../stores/mtgStore.js';

const store = useMtgStore();
const config = ref({ trendPrices: {} });
const loading = ref(false);
const rankingYearsBack = ref(2);

/**
 * Compute all booster types that appear in the trend prices config
 * (e.g. play, draft, set, collector, prerelease, etc.)
 */
const allBoosterTypes = computed(() => {
  const types = new Set();
  Object.values(config.value.trendPrices || {}).forEach((setPrices) => {
    Object.keys(setPrices || {}).forEach((type) => types.add(type));
  });
  return Array.from(types).sort();
});

const trendPricesData = computed(() => {
  const sets = store.setOptions;
  const boosterTypes = allBoosterTypes.value;
  const rows = [];

  if (!boosterTypes.length) return rows;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - rankingYearsBack.value);
  const now = new Date();

  sets.forEach((set) => {
    if (!set.releaseDate) return;
    const release = new Date(set.releaseDate);
    if (release < cutoff) return;
    if (release > now) return;

    const setPrices = config.value.trendPrices[set.code] || {};

    boosterTypes.forEach((type) => {
      const value = setPrices[type];
      // Only consider strictly positive prices as \"present\"; 0 or missing are treated as no price
      const price = typeof value === 'number' && value > 0 ? value : null;

      rows.push({
        setCode: set.code,
        setName: set.name,
        releaseDate: set.releaseDate,
        boosterType: type,
        price,
        hasPrice: price !== null,
      });
    });
  });

  // Sets / rows with a price first, then by newest release, then by code & type
  return rows.sort((a, b) => {
    if (a.hasPrice !== b.hasPrice) return a.hasPrice ? -1 : 1;
    if (a.releaseDate !== b.releaseDate) {
      // Newest first
      return (b.releaseDate || '').localeCompare(a.releaseDate || '');
    }
    if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode);
    return a.boosterType.localeCompare(b.boosterType);
  });
});

async function loadConfig() {
  loading.value = true;
  try {
    const response = await fetch('/trend-prices-config.json');
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status}`);
    }
    const data = await response.json();
    // Ignore any defaultPrices in the file; we only care about explicit trendPrices
    config.value = { trendPrices: data?.trendPrices || {} };
  } catch (error) {
    console.warn('Failed to load trend prices config:', error);
    ElMessage.warning('Failed to load trend prices config.');
    config.value = { trendPrices: {} };
  } finally {
    loading.value = false;
  }
}

function getPrice(setCode, boosterType) {
  const setPrices = config.value.trendPrices[setCode] || {};
  const value = setPrices[boosterType];
  // Only strictly positive values are considered as prices; 0 or missing are treated as no price
  return typeof value === 'number' && value > 0 ? value : null;
}

onMounted(async () => {
  await store.loadSetList();
  await loadConfig();
});
</script>

<template>
  <div class="trend-prices-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Configuration</p>
        <h1>Trend Prices by Set</h1>
        <p class="lead">
          Read-only view of trend prices for each booster type per set.
          Values are loaded from <code>public/trend-prices-config.json</code>.
        </p>
      </div>
    </header>

    <section class="controls">
      <ElCard shadow="never">
        <ElForm label-position="left" class="control-form" inline>
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

    <section class="prices-section">
      <ElCard shadow="never">
        <header class="card-head">
          <div>
            <h2>Set-Specific Prices</h2>
            <p>
              Values below come directly from <code>public/trend-prices-config.json</code>.
            </p>
          </div>
        </header>

        <template v-if="loading">
          <ElSkeleton :rows="10" animated />
        </template>

        <template v-else>
          <template v-if="trendPricesData.length">
            <ElTable :data="trendPricesData" stripe>
              <ElTableColumn prop="setCode" label="Set Code" width="100" />
              <ElTableColumn prop="setName" label="Set Name" min-width="200" />
              <ElTableColumn prop="releaseDate" label="Release Date" width="140" />
              <ElTableColumn prop="boosterType" label="Booster Type" width="140">
                <template #default="scope">
                  <ElTag size="small">{{ scope.row.boosterType }}</ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn label="Trend Price" width="160">
                <template #default="scope">
                  <span>
                    {{
                      scope.row.price !== null
                        ? `${scope.row.price.toFixed(2)} EUR`
                        : '-'
                    }}
                  </span>
                </template>
              </ElTableColumn>
            </ElTable>
          </template>
          <ElEmpty v-else description="No trend prices for the selected window." />
        </template>
      </ElCard>
    </section>

    <ElAlert
      type="info"
      :closable="false"
      style="margin-top: 2rem"
      title="Note"
        description="To modify trend prices, edit the file public/trend-prices-config.json manually. Values are used as-is by the application."
    />
  </div>
</template>

<style scoped>
.trend-prices-page {
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

.defaults-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.default-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.default-item label {
  font-weight: 600;
  color: #374151;
}

.default-item .currency {
  color: #6b7280;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.default-value {
  font-size: 1.2rem;
  font-weight: 600;
  color: #1f2937;
  margin-top: 0.25rem;
}

.price-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.default-price {
  color: #6b7280;
}
</style>


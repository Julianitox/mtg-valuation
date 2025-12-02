<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  ElAlert,
  ElCard,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElOption,
  ElSelect,
  ElSkeleton,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';
import { InfoFilled } from '@element-plus/icons-vue';
import { useMtgStore } from '../stores/mtgStore.js';

const store = useMtgStore();
const selectedSet = ref('');
const searchTerm = ref('');
const rarityFilter = ref('');
const finishFilter = ref('normal');
const minPrice = ref(0.2);

const setOptions = computed(() => store.setOptions);
const priceRows = computed(() => store.priceTable);

const availableRarities = computed(() =>
  Array.from(
    new Set(
      priceRows.value
        .map((row) => row.rarity ?? '')
        .filter((rarity) => rarity && rarity !== 'unknown'),
    ),
  ).sort(),
);

const availableFinishes = computed(() =>
  Array.from(
    new Set(
      priceRows.value
        .map((row) => row.finish ?? '')
        .filter((finish) => !!finish),
    ),
  ).sort(),
);

const filteredRows = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  const min = Number.isFinite(minPrice.value) ? minPrice.value : 0;
  return priceRows.value.filter((row) => {
    const matchesName =
      !term ||
      row.name.toLowerCase().includes(term) ||
      row.number?.toLowerCase().includes(term);
    const matchesRarity = !rarityFilter.value || row.rarity === rarityFilter.value;
    const matchesFinish = !finishFilter.value || row.finish === finishFilter.value;
    const matchesPrice = (row.price ?? 0) >= min;
    return matchesName && matchesRarity && matchesFinish && matchesPrice;
  });
});

const totalValue = computed(() => filteredRows.value.reduce((acc, row) => acc + (row.price ?? 0), 0));

const averageValue = computed(() => {
  if (!filteredRows.value.length) return 0;
  return totalValue.value / filteredRows.value.length;
});

onMounted(() => {
  store.loadSetList();
});

watch(
  () => selectedSet.value,
  (code) => {
    if (code) {
      store.loadSetPrices(code);
    } else {
      store.loadSetPrices('');
    }
  },
);
</script>

<template>
  <div class="prices-page">
    <ElCard shadow="never">
      <header class="card-head">
        <div>
          <h2>Card prices per set</h2>
          <p>Select a set to see the latest Cardmarket / TCGplayer values.</p>
        </div>
      </header>

      <ElForm label-position="top" class="filters">
        <ElFormItem label="Set filter">
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
        </ElFormItem>
        <ElFormItem label="Search">
          <ElInput
            v-model="searchTerm"
            placeholder="Search by name or collector number"
            clearable
          />
        </ElFormItem>
        <ElFormItem label="Rarity filter">
          <ElSelect v-model="rarityFilter" placeholder="All rarities" clearable>
            <ElOption
              v-for="rarity in availableRarities"
              :key="rarity"
              :label="rarity"
              :value="rarity"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="Finish filter">
          <ElSelect v-model="finishFilter" placeholder="All finishes" clearable>
            <ElOption
              v-for="finish in availableFinishes"
              :key="finish"
              :label="finish"
              :value="finish"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="Min price (EUR)">
          <ElInput
            v-model.number="minPrice"
            type="number"
            min="0"
            step="0.05"
            placeholder="0.20"
          />
        </ElFormItem>
      </ElForm>

      <section class="summary" v-if="filteredRows.length">
        <ElTag size="large" type="info">
          Cards: {{ filteredRows.length }}
        </ElTag>
        <ElTag size="large" type="success">
          Total value: {{ totalValue.toFixed(2) }} {{ filteredRows[0]?.currency ?? 'USD' }}
        </ElTag>
        <ElTag size="large">
          Average price: {{ averageValue.toFixed(2) }} {{ filteredRows[0]?.currency ?? 'USD' }}
        </ElTag>
      </section>

      <section class="table-wrapper">
        <template v-if="store.priceTableLoading">
          <ElSkeleton :rows="5" animated />
        </template>
        <template v-else-if="store.priceTableError">
          <ElAlert
            :title="store.priceTableError"
            type="error"
            show-icon
          />
        </template>
        <template v-else-if="!filteredRows.length">
          <ElEmpty description="Select a set or adjust filters to display prices." />
        </template>
        <template v-else>
          <ElTable :data="filteredRows" height="600" stripe>
            <ElTableColumn prop="number" label="#" width="80" />
            <ElTableColumn prop="name" label="Card" min-width="240" />
            <ElTableColumn prop="manaValue" label="MV" width="80" sortable>
              <template #default="scope">
                <ElTooltip
                  v-if="scope.row.manaValue == null"
                  content="Mana value unavailable (land or special card)."
                  placement="top"
                >
                  <span class="mv-fallback">?</span>
                </ElTooltip>
                <span v-else>
                  {{ scope.row.manaValue }}
                </span>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="types" label="Types" min-width="160">
              <template #default="scope">
                {{ scope.row.types?.join(' — ') ?? '—' }}
              </template>
            </ElTableColumn>
            <ElTableColumn prop="rarity" label="Rarity" width="120" sortable>
              <template #default="scope">
                <ElTag>{{ scope.row.rarity }}</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="finish" label="Finish" width="120" sortable />
            <ElTableColumn prop="medium" label="Medium" width="110" sortable />
            <ElTableColumn prop="price" label="Price" width="140" sortable>
              <template #default="scope">
                <span v-if="scope.row.price">
                  {{ scope.row.price.toFixed(2) }} {{ scope.row.currency }}
                </span>
                <span v-else>N/A</span>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="vendor" label="Source" width="140">
              <template #default="scope">
                <ElTag type="info">
                  {{ scope.row.vendor }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="lastUpdated" label="Updated" width="140" />
            <ElTableColumn label="Variant" width="90">
              <template #default="scope">
                <ElTooltip :content="scope.row.variantSummary" placement="top">
                  <ElIcon>
                    <InfoFilled />
                  </ElIcon>
                </ElTooltip>
              </template>
            </ElTableColumn>
          </ElTable>
        </template>
      </section>
    </ElCard>
  </div>
</template>

<style scoped>
.prices-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.card-head h2 {
  margin: 0;
}

.card-head p {
  margin: 0.3rem 0 0;
  color: #4c5564;
}

.filters {
  margin-top: 1.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.table-wrapper {
  margin-top: 1rem;
}

.mv-fallback {
  font-weight: 600;
  color: #b45309;
}
</style>


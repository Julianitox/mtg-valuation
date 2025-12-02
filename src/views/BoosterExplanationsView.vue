<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  ElAlert,
  ElCard,
  ElTable,
  ElTableColumn,
  ElTag,
  ElSkeleton,
} from 'element-plus';
import { useI18n } from '../composables/useI18n.js';
import { useMtgStore } from '../stores/mtgStore.js';
import { fetchLocalSet } from '../services/mtgjsonClient.js';

const { t } = useI18n();
const store = useMtgStore();

const mh3Data = ref(null);
const loading = ref(true);
const selectedBoosterType = ref('play');

// Load MH3 data for detailed example
onMounted(async () => {
  try {
    const payload = await fetchLocalSet('MH3');
    mh3Data.value = payload.data;
  } catch (error) {
    console.error('Failed to load MH3 data:', error);
  } finally {
    loading.value = false;
  }
});

// Extract MH3 play booster details
const playBooster = computed(() => {
  if (!mh3Data.value?.booster?.play) return null;
  return mh3Data.value.booster.play;
});

const sheets = computed(() => {
  if (!playBooster.value) return [];
  const sheetsData = playBooster.value.sheets || {};
  return Object.entries(sheetsData).map(([name, config]) => ({
    name,
    cards: config.cards || {},
    totalWeight: config.totalWeight || 0,
    foil: config.foil || false,
    cardCount: Object.keys(config.cards || {}).length,
  }));
});

const layouts = computed(() => {
  if (!playBooster.value) return [];
  const totalWeight = playBooster.value.boostersTotalWeight || 1;
  return (playBooster.value.boosters || []).map((layout, index) => ({
    index: index + 1,
    weight: layout.weight || 1,
    probability: ((layout.weight || 1) / totalWeight) * 100,
    contents: layout.contents || {},
  }));
});

const setInfo = computed(() => {
  if (!mh3Data.value) return null;
  return {
    code: mh3Data.value.code,
    name: mh3Data.value.name,
    releaseDate: mh3Data.value.releaseDate,
    totalCards: mh3Data.value.cards?.length || 0,
  };
});
</script>

<template>
  <div class="explanations-page">
    <header class="page-header">
      <div class="header-content">
        <div>
          <p class="eyebrow">{{ t('explanations.reference') }}</p>
          <h1>{{ t('explanations.title') }}</h1>
          <p class="lead">{{ t('explanations.subtitle') }}</p>
        </div>
      </div>
    </header>

    <div class="reference-box">
      <strong>{{ t('explanations.reference') }}:</strong>
      <a href="https://mtgjson.com/data-models/booster/" target="_blank">
        MTGJSON Documentation - Booster
      </a>
    </div>

    <!-- Section 1: Global Structure -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section1.title') }}</h2>
        <p>{{ t('explanations.section1.desc') }}</p>

        <div class="code-block">
          <pre><code>{
  "data": {
    "booster": {
      "play": {
        "sheets": { ... },
        "boosters": [ ... ],
        "boostersTotalWeight": 640
      },
      "collector": { ... }
    }
  }
}</code></pre>
        </div>

        <div class="example-box" v-if="setInfo">
          <div class="example-title">{{ t('explanations.section1.example') }}</div>
          <p><strong>{{ t('explanations.set') }}:</strong> {{ setInfo.name }} ({{ setInfo.code }})</p>
          <p><strong>{{ t('explanations.release-date') }}:</strong> {{ setInfo.releaseDate }}</p>
          <p><strong>{{ t('explanations.total-cards') }}:</strong> {{ setInfo.totalCards }}</p>
          <p>
            <strong>{{ t('explanations.section1.types') }}:</strong>
            <ElTag
              v-for="type in Object.keys(mh3Data?.booster || {})"
              :key="type"
              style="margin-left: 0.5rem"
            >
              {{ type }}
            </ElTag>
          </p>
        </div>
      </ElCard>
    </section>

    <!-- Section 2: Sheets -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section2.title') }}</h2>
        <h3>{{ t('explanations.section2.def') }}</h3>

        <div class="code-block">
          <pre><code>{
  "common": {
    "cards": {
      "uuid-carte-1": 1,
      "uuid-carte-2": 1,
      ...
    },
    "totalWeight": 80,
    "foil": false
  }
}</code></pre>
        </div>

        <div class="example-box" v-if="sheets.length">
          <div class="example-title">{{ t('explanations.section2.example') }}</div>
          <ElTable :data="sheets" stripe>
            <ElTableColumn prop="name" :label="t('explanations.sheet')" width="200" />
            <ElTableColumn :label="t('explanations.section2.cards')" width="120">
              <template #default="scope">
                {{ scope.row.cardCount }}
              </template>
            </ElTableColumn>
            <ElTableColumn :label="t('explanations.section2.weight')" width="140">
              <template #default="scope">
                {{ scope.row.totalWeight }}
              </template>
            </ElTableColumn>
            <ElTableColumn :label="t('explanations.section2.foil')" width="100">
              <template #default="scope">
                <ElTag v-if="scope.row.foil" type="warning">Foil</ElTag>
                <span v-else>No</span>
              </template>
            </ElTableColumn>
          </ElTable>
          <p class="explanation-text">
            <strong>{{ t('explanations.section2.meaning') }}:</strong>
            {{ t('explanations.if-card') }} {{ t('explanations.section2.weight') }} 1
            {{ t('explanations.then-prob') }}: 1/{{ sheets.find((s) => s.name === 'common')?.totalWeight || 80 }} ≈
            {{ ((1 / (sheets.find((s) => s.name === 'common')?.totalWeight || 80)) * 100).toFixed(2) }}%
          </p>
        </div>
      </ElCard>
    </section>

    <!-- Section 3: Layouts -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section3.title') }}</h2>
        <h3>{{ t('explanations.section3.def') }}</h3>

        <div class="example-box" v-if="layouts.length">
          <div class="example-title">{{ t('explanations.section3.example') }}</div>
          <ElTable :data="layouts.slice(0, 3)" stripe>
            <ElTableColumn prop="index" label="#" width="60" />
            <ElTableColumn :label="t('explanations.section3.weight')" width="100">
              <template #default="scope">
                {{ scope.row.weight }}
              </template>
            </ElTableColumn>
            <ElTableColumn :label="t('explanations.section3.probability')" width="140">
              <template #default="scope">
                {{ scope.row.probability.toFixed(2) }}%
              </template>
            </ElTableColumn>
            <ElTableColumn :label="t('explanations.section3.example')" min-width="300">
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
          </ElTable>
        </div>
      </ElCard>
    </section>

    <!-- Section 4: EV Calculation Steps -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section4.title') }}</h2>

        <div class="step-box">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>{{ t('explanations.section4.step1.title') }}</h3>
            <p>{{ t('explanations.section4.step1.desc') }}</p>
            <div class="formula-box">
              {{ t('explanations.section4.step1.formula') }}
            </div>
            <div class="example-box">
              <div class="example-title">{{ t('explanations.section4.step1.example') }}</div>
              <p>
                {{ t('explanations.suppose') }} 3 {{ t('explanations.card').toLowerCase() }}s:
              </p>
              <ul>
                <li>{{ t('explanations.card') }} A: {{ t('explanations.section3.weight') }}=1, {{ t('explanations.price') }}=0.10€</li>
                <li>{{ t('explanations.card') }} B: {{ t('explanations.section3.weight') }}=1, {{ t('explanations.price') }}=0.15€</li>
                <li>{{ t('explanations.card') }} C: {{ t('explanations.section3.weight') }}=1, {{ t('explanations.price') }}=0.05€</li>
              </ul>
              <p><strong>{{ t('explanations.section6.calculations') }}:</strong></p>
              <p>
                Contribution A = 1/80 × 0.10€ = 0.00125€<br />
                Contribution B = 1/80 × 0.15€ = 0.001875€<br />
                Contribution C = 1/80 × 0.05€ = 0.000625€<br />
                ... ({{ t('explanations.total') }} {{ sheets.find((s) => s.name === 'common')?.cardCount || 80 }}
                {{ t('explanations.card').toLowerCase() }}s)
              </p>
              <p><strong>EV_common</strong> = {{ t('explanations.total') }} of all contributions</p>
            </div>
            <div class="important-box">
              <strong>{{ t('explanations.section4.step1.important') }}:</strong>
              <ul>
                <li>
                  If minPrice is configured and a card has price &lt; minPrice, its value is set to 0
                </li>
                <li>We use foil price if the sheet contains foils (sheetConfig.foil === true)</li>
                <li>Currency is determined by the first card that has a price</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="step-box">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>{{ t('explanations.section4.step2.title') }}</h3>
            <p>{{ t('explanations.section4.step2.desc') }}</p>
            <div class="formula-box">
              {{ t('explanations.section4.step2.formula') }}
            </div>
            <div class="example-box" v-if="layouts.length">
              <div class="example-title">{{ t('explanations.example') }} (MH3 Play Booster)</div>
              <p>{{ t('explanations.suppose') }}:</p>
              <ul>
                <li>EV_common = 0.50€</li>
                <li>EV_newRareMythic = 2.00€</li>
                <li>EV_newUncommon = 0.15€</li>
                <li>EV_reprint = 0.30€</li>
                <li>EV_wildcard = 0.25€</li>
                <li>EV_foilWithShowcase = 0.80€</li>
                <li>EV_land = 0.05€</li>
              </ul>
              <p>{{ t('explanations.for-layout') }} #1 ({{ Object.entries(layouts[0]?.contents || {}).map(([k, v]) => `${v}× ${k}`).join(', ') }}):</p>
              <p>
                EV_layout1 = (6 × 0.50) + (1 × 2.00) + (3 × 0.15) + (1 × 0.30) + (1 × 0.25) + (1 × 0.80) + (1 × 0.05)<br />
                = 3.00 + 2.00 + 0.45 + 0.30 + 0.25 + 0.80 + 0.05 = <strong>6.85€</strong>
              </p>
              <p style="margin-top: 0.75rem; font-size: 0.9rem; color: #6b7280;">
                <em>Note: This is a simplified example. Actual calculations use real card prices from MTGJSON.</em>
              </p>
            </div>
          </div>
        </div>

        <div class="step-box">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>{{ t('explanations.section4.step3.title') }}</h3>
            <p>{{ t('explanations.section4.step3.desc') }}</p>
            <div class="formula-box">
              {{ t('explanations.section4.step3.formula') }}
            </div>
            <div class="example-box" v-if="layouts.length">
              <div class="example-title">{{ t('explanations.example') }} (MH3 Play Booster)</div>
              <p>{{ t('explanations.suppose') }} {{ layouts.length }} {{ t('explanations.layout').toLowerCase() }}s:</p>
              <ul>
                <li v-for="layout in layouts.slice(0, 3)" :key="layout.index">
                  Layout #{{ layout.index }}: {{ t('explanations.section3.weight') }}={{ layout.weight }}, 
                  Probability={{ layout.probability.toFixed(2) }}%, EV=6.85€ ({{ t('explanations.example') }})
                </li>
                <li v-if="layouts.length > 3">... and {{ layouts.length - 3 }} more layouts</li>
                <li><strong>{{ t('explanations.total') }} {{ t('explanations.section3.weight') }}:</strong> {{ playBooster?.boostersTotalWeight || 640 }}</li>
              </ul>
              <p><strong>{{ t('explanations.section6.calculations') }}:</strong></p>
              <p>
                EV_booster = (6.85 × {{ layouts[0]?.weight || 189 }} + 6.80 × {{ layouts[1]?.weight || 150 }} + 6.75 × {{ layouts[2]?.weight || 120 }} + ...) / {{ playBooster?.boostersTotalWeight || 640 }}<br />
                EV_booster = ({{ (layouts[0]?.weight || 189) * 6.85 + (layouts[1]?.weight || 150) * 6.80 + (layouts[2]?.weight || 120) * 6.75 }}) / {{ playBooster?.boostersTotalWeight || 640 }}<br />
                EV_booster = <strong>~6.82€</strong> ({{ t('explanations.example') }})
              </p>
              <p style="margin-top: 0.75rem; font-size: 0.9rem; color: #6b7280;">
                <em>Note: Actual EV depends on real card prices. Use the "Booster Details" page to see real calculations for MH3.</em>
              </p>
            </div>
          </div>
        </div>
      </ElCard>
    </section>

    <!-- Section 5: Minimum Price -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section5.title') }}</h2>
        <p>{{ t('explanations.section5.desc') }}</p>
        <div class="important-box">
          <strong>{{ t('explanations.impact') }}:</strong>
          {{ t('explanations.section5.desc') }}
        </div>
      </ElCard>
    </section>

    <!-- Section 6: Complete Example -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section6.title') }}</h2>
        <div class="example-box" v-if="setInfo">
          <div class="example-title">{{ t('explanations.section6.input') }}</div>
          <ul>
            <li><strong>{{ t('explanations.set') }}:</strong> {{ setInfo.name }} ({{ setInfo.code }})</li>
            <li><strong>{{ t('explanations.booster-type') }}:</strong> Play</li>
            <li><strong>{{ t('explanations.min-price') }}:</strong> 1.00€</li>
          </ul>
          <div class="example-title" style="margin-top: 1.5rem">{{ t('explanations.section6.calculations') }}</div>
          <ol>
            <li>
              <strong>{{ t('explanations.sheet') }} "common":</strong><br />
              {{ sheets.find((s) => s.name === 'common')?.cardCount || 80 }}
              {{ t('explanations.card').toLowerCase() }}s, totalWeight = {{ sheets.find((s) => s.name === 'common')?.totalWeight || 80 }}<br />
              Each card has weight=1, so probability per card = 1/{{ sheets.find((s) => s.name === 'common')?.totalWeight || 80 }} ≈ {{ ((1 / (sheets.find((s) => s.name === 'common')?.totalWeight || 80)) * 100).toFixed(2) }}%<br />
              {{ t('explanations.example') }}: If a common card costs 1.50€ and minPrice=1.00€, contribution = 1/{{ sheets.find((s) => s.name === 'common')?.totalWeight || 80 }} × 1.50 = 0.01875€<br />
              EV_common = sum of all card contributions (cards &lt; minPrice count as 0€)
            </li>
            <li>
              <strong>{{ t('explanations.sheet') }} "newRareMythic":</strong><br />
              {{ sheets.find((s) => s.name === 'newRareMythic')?.cardCount || 0 }}
              {{ t('explanations.card').toLowerCase() }}s, totalWeight = {{ sheets.find((s) => s.name === 'newRareMythic')?.totalWeight || 0 }}<br />
              Cards have different weights (2, 8, 12, etc.) - mythics are rarer!<br />
              {{ t('explanations.example') }}: A rare card with weight=2 and price=5.00€ contributes: 2/{{ sheets.find((s) => s.name === 'newRareMythic')?.totalWeight || 780 }} × 5.00€ ≈ 0.0128€<br />
              EV_newRareMythic = weighted sum of all rare/mythic contributions
            </li>
            <li>
              <strong>{{ t('explanations.sheet') }} "foilWithShowcase":</strong><br />
              {{ sheets.find((s) => s.name === 'foilWithShowcase')?.cardCount || 0 }}
              {{ t('explanations.card').toLowerCase() }}s, totalWeight = {{ sheets.find((s) => s.name === 'foilWithShowcase')?.totalWeight || 0 }}<br />
              This sheet contains foils, so we use foil prices from MTGJSON<br />
              Cards have varying weights (e.g., 1210, 7896, 5264) - showcase cards are rarer!
            </li>
            <li>
              <strong>{{ t('explanations.layout') }} #1 ({{ t('explanations.section3.weight') }}={{ layouts[0]?.weight || 189 }}, {{ ((layouts[0]?.probability || 0)).toFixed(2) }}%):</strong><br />
              Contents: {{ Object.entries(layouts[0]?.contents || {}).map(([k, v]) => `${v}× ${k}`).join(', ') }}<br />
              EV_layout1 = {{ Object.entries(layouts[0]?.contents || {}).map(([k, v]) => `${v}× EV_${k}`).join(' + ') }}<br />
              (Actual values depend on real card prices from MTGJSON)
            </li>
            <li>
              <strong>{{ t('explanations.final-ev') }}:</strong><br />
              Weighted average across all {{ layouts.length }} layouts:<br />
              EV_booster = (EV_layout1 × {{ layouts[0]?.weight || 189 }} + EV_layout2 × {{ layouts[1]?.weight || 150 }} + ...) / {{ playBooster?.boostersTotalWeight || 640 }}<br />
              Result depends on actual card prices. Check the "Booster Details" page for real calculations!
            </li>
          </ol>
        </div>
      </ElCard>
    </section>

    <!-- Section 7: Key Points -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section8.title') }}</h2>
        <ul class="key-points">
          <li><strong>{{ t('explanations.sheet') }}s</strong> define card probabilities</li>
          <li><strong>{{ t('explanations.layout') }}s</strong> define possible sheet combinations</li>
          <li><strong>EV of a {{ t('explanations.sheet') }}</strong> = weighted average of card prices</li>
          <li><strong>EV of a {{ t('explanations.layout') }}</strong> = sum of (quantity × EV_sheet)</li>
          <li><strong>EV of booster</strong> = weighted average of EV_layouts</li>
          <li><strong>Minimum price</strong> allows excluding bulk cards</li>
          <li><strong>Foils</strong> are handled separately with their own prices</li>
        </ul>
      </ElCard>
    </section>

    <!-- Section 8: Code References -->
    <section class="content-section">
      <ElCard shadow="never">
        <h2>{{ t('explanations.section9.title') }}</h2>
        <ul>
          <li>
            <strong>Valuation calculations:</strong>
            <code>src/stores/mtgStore.js</code> → <code>buildBoosterValuations()</code> (lines 225-295)
          </li>
          <li>
            <strong>Price extraction:</strong> <code>src/utils/priceExtractors.js</code> →
            <code>pickLatestPrice()</code>
          </li>
          <li>
            <strong>Display:</strong> <code>src/views/DashboardView.vue</code> → "Booster expected value" section
          </li>
        </ul>
      </ElCard>
    </section>
  </div>
</template>

<style scoped>
.explanations-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  margin-bottom: 2rem;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  flex-wrap: wrap;
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

.reference-box {
  background: #f3f4f6;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  border-left: 4px solid #6b7280;
}

.reference-box a {
  color: #3b82f6;
  text-decoration: none;
  margin-left: 0.5rem;
}

.reference-box a:hover {
  text-decoration: underline;
}

.content-section {
  margin-bottom: 2rem;
}

.content-section h2 {
  color: #1f2937;
  font-size: 1.8rem;
  margin-bottom: 1rem;
  padding-left: 1rem;
  border-left: 4px solid #3b82f6;
}

.content-section h3 {
  color: #374151;
  font-size: 1.4rem;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.code-block {
  background: #1f2937;
  color: #f9fafb;
  padding: 1.5rem;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1rem 0;
}

.code-block pre {
  margin: 0;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.9rem;
}

.code-block code {
  color: #f9fafb;
}

.example-box {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  padding: 1.5rem;
  margin: 1.5rem 0;
  border-radius: 4px;
}

.example-title {
  font-weight: bold;
  color: #92400e;
  margin-bottom: 0.75rem;
  font-size: 1.1rem;
}

.example-box ul {
  margin-left: 2rem;
  margin-top: 0.5rem;
}

.example-box li {
  margin: 0.5rem 0;
}

.formula-box {
  background: #eff6ff;
  border: 2px solid #3b82f6;
  padding: 1.5rem;
  border-radius: 8px;
  margin: 1rem 0;
  font-size: 1.1rem;
  text-align: center;
  font-family: 'Monaco', monospace;
}

.step-box {
  background: white;
  padding: 1.5rem;
  margin: 1.5rem 0;
  border-radius: 8px;
  border-left: 4px solid #10b981;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  gap: 1rem;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #10b981;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-weight: bold;
  font-size: 1.2rem;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content h3 {
  margin-top: 0;
}

.important-box {
  background: #f0f9ff;
  border-left: 4px solid #0ea5e9;
  padding: 1rem 1.5rem;
  margin-top: 1rem;
  border-radius: 4px;
}

.important-box ul {
  margin-left: 2rem;
  margin-top: 0.5rem;
}

.important-box li {
  margin: 0.5rem 0;
}

.key-points {
  list-style: none;
  padding-left: 0;
}

.key-points li {
  padding: 0.75rem 0;
  padding-left: 1.5rem;
  position: relative;
}

.key-points li::before {
  content: '✓';
  position: absolute;
  left: 0;
  font-weight: bold;
  color: #10b981;
}

.contents-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.explanation-text {
  margin-top: 1rem;
  color: #6b7280;
}

@media (max-width: 768px) {
  .explanations-page {
    padding: 1rem;
  }

  .header-content {
    flex-direction: column;
  }

  .step-box {
    flex-direction: column;
  }

  .step-number {
    align-self: flex-start;
  }
}
</style>


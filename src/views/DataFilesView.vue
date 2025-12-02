<script setup>
import { onMounted, ref, computed } from 'vue';
import { ElCard, ElTable, ElTableColumn, ElTag, ElSkeleton, ElEmpty } from 'element-plus';

const loading = ref(true);
const files = ref([]);

const staticFiles = [
  {
    id: 'set-list',
    path: 'mtgjson/SetList.json',
    label: 'SetList.json',
    description: 'List of all MTGJSON sets and their metadata.',
  },
  {
    id: 'all-identifiers',
    path: 'mtgjson/AllIdentifiers.json',
    label: 'AllIdentifiers.json',
    description: 'Global list of all card UUIDs and basic card info.',
  },
  {
    id: 'all-prices-today',
    path: 'mtgjson/AllPricesToday.json',
    label: 'AllPricesToday.json',
    description: 'Daily snapshot of card prices (Cardmarket, TCGPlayer, etc.).',
  },
  {
    id: 'trend-prices',
    path: 'trend-prices-config.json',
    label: 'trend-prices-config.json',
    description: 'Manual configuration of trend prices per set and booster type.',
  },
];

const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null;

onMounted(async () => {
  const results = [];

  for (const file of staticFiles) {
    try {
      const response = await fetch(`/${file.path}`, { method: 'HEAD' });
      if (!response.ok) {
        results.push({
          ...file,
          url: `/${file.path}`,
          status: 'missing',
          lastModified: null,
        });
        continue;
      }

      const lastModified = response.headers.get('last-modified');
      results.push({
        ...file,
        url: `/${file.path}`,
        status: 'ok',
        lastModified,
      });
    } catch (e) {
      results.push({
        ...file,
        url: `/${file.path}`,
        status: 'error',
        lastModified: null,
      });
    }
  }

  files.value = results;
  loading.value = false;
});

const hasAnyFile = computed(() => files.value.length > 0);
</script>

<template>
  <div class="data-files-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Configuration</p>
        <h1>Imported JSON Data</h1>
        <p class="lead">
          Overview of all local JSON data files used by the application, with their last modified
          date.
        </p>
      </div>
      <div v-if="buildTime" class="build-meta">
        <span class="build-label">Last build:</span>
        <span class="build-value">{{ new Date(buildTime).toLocaleString() }}</span>
      </div>
    </header>

    <ElCard shadow="never">
      <header class="card-head">
        <div>
          <h2>Data files</h2>
          <p>Files must be present under the <code>public</code> folder (e.g. <code>/mtgjson</code>).</p>
        </div>
      </header>

      <template v-if="loading">
        <ElSkeleton :rows="6" animated />
      </template>
      <template v-else>
        <template v-if="hasAnyFile">
          <ElTable :data="files" stripe>
            <ElTableColumn prop="label" label="File" min-width="200">
              <template #default="scope">
                <div class="file-name">
                  <code>{{ scope.row.label }}</code>
                  <span class="file-path">{{ scope.row.path }}</span>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="status" label="Status" width="120">
              <template #default="scope">
                <ElTag
                  :type="scope.row.status === 'ok' ? 'success' : scope.row.status === 'missing' ? 'danger' : 'warning'"
                  size="small"
                >
                  {{
                    scope.row.status === 'ok'
                      ? 'Available'
                      : scope.row.status === 'missing'
                        ? 'Missing'
                        : 'Error'
                  }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="lastModified" label="Last Modified" width="220">
              <template #default="scope">
                <span>
                  {{ scope.row.lastModified ? new Date(scope.row.lastModified).toLocaleString() : '-' }}
                </span>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="description" label="Description" min-width="260" />
          </ElTable>
        </template>
        <ElEmpty v-else description="No data files detected." />
      </template>
    </ElCard>
  </div>
</template>

<style scoped>
.data-files-page {
  width: 100%;
}

.page-header {
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.75rem;
  color: #7c8794;
}

.page-header h1 {
  margin: 0.5rem 0 0;
  font-size: 2rem;
  color: #1f2937;
}

.lead {
  margin: 0;
  color: #4c5564;
  max-width: 56ch;
}

.build-meta {
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
  color: #4b5563;
}

.build-label {
  font-weight: 600;
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
  color: #4c5564;
}

.file-name {
  display: flex;
  flex-direction: column;
}

.file-name code {
  font-weight: 600;
}

.file-path {
  font-size: 0.85rem;
  color: #6b7280;
}

.price-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>



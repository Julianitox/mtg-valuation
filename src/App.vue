<script setup>
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { ElSelect, ElOption, ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus';
import { useI18n } from './composables/useI18n.js';

const { t, currentLang, setLanguage, languages } = useI18n();

const links = [
  { label: () => t('nav.booster-valuation'), to: '/' },
  { label: () => t('nav.card-prices'), to: '/prices' },
  { label: () => t('nav.booster-details'), to: '/booster-details' },
  { label: () => t('nav.trend-prices'), to: '/trend-prices' },
  { label: () => t('nav.explanations'), to: '/explanations' },
  { label: () => t('nav.data-files'), to: '/data-files' },
];

const route = useRoute();
const router = useRouter();
const activePath = computed(() => route.path);
</script>

<template>
  <div class="shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">MTG Valuation Lab</p>
        <h1>MTGJSON Companion</h1>
      </div>
      <div class="header-actions">
        <ElSelect
          v-model="currentLang"
          @change="setLanguage"
          size="small"
          class="lang-select"
        >
          <ElOption
            v-for="(label, code) in languages"
            :key="code"
            :label="label"
            :value="code"
          />
        </ElSelect>
        <ElDropdown
          class="menu-toggle"
          trigger="click"
          placement="bottom-end"
        >
          <button
            type="button"
            aria-label="Toggle navigation menu"
            class="menu-toggle-button"
          >
            ☰
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem
                v-for="link in links"
                :key="link.to"
                @click="router.push(link.to)"
              >
                {{ typeof link.label === 'function' ? link.label() : link.label }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <nav class="primary-nav">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            class="nav-link"
            :class="{ active: activePath === link.to }"
            :to="link.to"
          >
            {{ typeof link.label === 'function' ? link.label() : link.label }}
          </RouterLink>
        </nav>
      </div>
    </header>
    <section class="content">
      <RouterView />
    </section>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  padding: 1.5rem clamp(1rem, 4vw, 3rem);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.lang-select {
  width: 120px;
}

.app-header h1 {
  margin: 0.25rem 0 0;
  font-size: clamp(1.5rem, 4vw, 2.3rem);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.75rem;
  color: #7c8794;
  margin: 0;
}

.primary-nav {
  display: flex;
  gap: 0.75rem;
}

.nav-link {
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  border: 1px solid transparent;
  color: #4c5564;
  text-decoration: none;
  font-weight: 600;
}

.nav-link.active {
  border-color: #2563eb;
  color: #0f172a;
  background: rgba(37, 99, 235, 0.08);
}

/* Dropdown trigger for small/medium screens */
.menu-toggle {
  display: inline-flex;
}

.menu-toggle-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #4b5563;
  font-size: 1rem;
  cursor: pointer;
}

/* On large screens, always show full horizontal navigation and hide burger dropdown */
@media (min-width: 1024px) {
  .menu-toggle {
    display: none;
  }
}

/* On small and medium screens (mobile + petits écrans desktop),
   use a dropdown-style menu under the header */
@media (max-width: 1023px) {
  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .primary-nav {
    display: none;
    width: 100%;
    margin-top: 0.5rem;
    flex-direction: column;
  }

  .app-header.nav-open .primary-nav {
    display: flex;
  }

  .nav-link {
    width: 100%;
    justify-content: center;
    text-align: center;
  }
}

.content {
  flex: 1;
}
</style>

import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import PricesView from '../views/PricesView.vue';
import BoosterDetailsView from '../views/BoosterDetailsView.vue';
import TrendPricesView from '../views/TrendPricesView.vue';
import BoosterExplanationsView from '../views/BoosterExplanationsView.vue';
import DataFilesView from '../views/DataFilesView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/prices',
      name: 'prices',
      component: PricesView,
    },
    {
      path: '/booster-details',
      name: 'booster-details',
      component: BoosterDetailsView,
    },
    {
      path: '/trend-prices',
      name: 'trend-prices',
      component: TrendPricesView,
    },
    {
      path: '/explanations',
      name: 'explanations',
      component: BoosterExplanationsView,
    },
    {
      path: '/data-files',
      name: 'data-files',
      component: DataFilesView,
    },
  ],
});


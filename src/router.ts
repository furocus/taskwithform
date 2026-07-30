import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from './app/AppLayout.vue'
import CalendarPage from './pages/CalendarPage.vue'
import LoginPage from './pages/LoginPage.vue'
import MainPage from './pages/MainPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'main',
          component: MainPage,
        },
        {
          path: 'calendar',
          name: 'calendar',
          component: CalendarPage,
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/login',
    },
  ],
})

export default router

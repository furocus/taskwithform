import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from './app/AppLayout.vue'
import CalendarPage from './pages/CalendarPage.vue'
import LoginPage from './pages/LoginPage.vue'
import MainPage from './pages/MainPage.vue'
import { getAuthSession } from './features/auth/auth.api'

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
      meta: { requiresAuth: true },
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

router.beforeEach(async (to) => {
  let session

  try {
    session = await getAuthSession()
  } catch {
    if (to.name === 'login') {
      return true
    }

    return {
      name: 'login',
      query: { error: 'session_check_failed' },
    }
  }

  const requiresAuth = to.matched.some(
    (routeRecord) => routeRecord.meta.requiresAuth === true,
  )

  if (requiresAuth && !session.authenticated) {
    return { name: 'login' }
  }

  if (to.name === 'login' && session.authenticated) {
    return { name: 'main' }
  }

  return true
})

export default router

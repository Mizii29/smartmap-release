import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Navigation',
    component: () => import('@/views/Navigation.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/diary',
    name: 'Diary',
    component: () => import('@/views/Diary.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/diaries',
    name: 'AdminDiaries',
    component: () => import('@/views/AdminDiaries.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/planner', component: () => import('@/views/Planner.vue'), meta: { requiresAuth: true }
  }

]

const router = createRouter({
  history: createWebHistory(),
  routes
})

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  const user = getStoredUser()

  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.meta.requiresAdmin && user?.role !== 'admin') {
    next('/')
  } else if (to.path === '/login' && token) {
    next(user?.role === 'admin' ? '/admin/diaries' : '/')
  } else {
    next()
  }
})

export default router

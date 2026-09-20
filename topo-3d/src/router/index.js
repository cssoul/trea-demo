import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/topo/viewer'
  },
  {
    path: '/topo',
    name: 'Topo',
    component: () => import('@/views/topo/index.vue'),
    children: [
      {
        path: 'editor',
        name: 'TopoEditor',
        component: () => import('@/views/topo/Editor.vue')
      },
      {
        path: 'viewer',
        name: 'TopoViewer',
        component: () => import('@/views/topo/Viewer.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router

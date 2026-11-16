import { createRouter, createWebHistory } from 'vue-router'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import insumos from '../views/insumos.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import dolar from '../views/dolar.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import reporte from '../views/reporte.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import formulas from '../views/formulas.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import parteDiario from '../views/pdiario.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import comandaMateriales from '../views/cmateriales.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import compoProdu from '../views/compoProdu.vue'
// The view currently has no generated TypeScript declaration.
// @ts-expect-error: Vue SFC declaration is provided by the Vue tooling at build time.
import costeo from '../views/costeo.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/insumos',
      name: 'insumos',
      component: insumos,
    },
    {
      path: '/dolar',
      name: 'dolar',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: dolar,
    },
    {
      path: '/reporte',
      name: 'reporte',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: reporte,
    },
    {
      path: '/formulas',
      name: 'formulas',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: formulas,
    },
    {
      path: '/pdiario',
      name: 'pdiario',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: parteDiario,
    },
    {
      path: '/cmateriales',
      name: 'cmateriales',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: comandaMateriales,
    },
    {
      path: '/compoProdu',
      name: 'compoProdu',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: compoProdu, 
    },
    {
      path: '/costeo',
      name: 'costeo',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: costeo, 
    },
  ],
})

export default router

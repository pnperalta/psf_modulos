<script setup>
// node server.js

import { ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

const menuAbierto = ref(false)

function toggleMenu() {
  menuAbierto.value = !menuAbierto.value
}
</script>

<template>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">

  <div class="app-layout">
    <header>
      <img alt="Vue logo" src="./assets/logopsf.png"/>
      <nav>
        <div class="tab toggle-tab" @click="toggleMenu">
          <i class="bi bi-file-earmark-ruled-fill"></i>
          <span>Insumos y Materiales</span>
          <i class="bi ms-auto" :class="menuAbierto ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
        </div>

        <nav class="menu_desp" :class="{ abierto: menuAbierto }">
          <RouterLink to="/insumos" class="tab sub-tab">
            <i class="bi bi-list-columns"></i>
            <span>Insumos</span>
          </RouterLink>
          <RouterLink to="/dolar" class="tab sub-tab">
            <i class="bi bi-cash-coin"></i>
            <span>Cambio</span>
          </RouterLink> 
          <RouterLink to="/reporte" class="tab sub-tab">
            <i class="bi bi-newspaper"></i>
            <span>Reporte</span>
          </RouterLink>
        </nav>

        <RouterLink to="/formulas" class="tab">
          <i class="bi bi-table"></i>
          <span>Formulas</span>
        </RouterLink>
        
        <RouterLink to="/pdiario" class="tab">
          <i class="bi bi-receipt"></i>
          <span>Parte Diario</span>
        </RouterLink>

        <RouterLink to="/cmateriales" class="tab">
          <i class="bi bi-clipboard2-fill"></i>
          <span>Comanda de Materiales</span>
        </RouterLink>
        
        <RouterLink to="/compoProdu" class="tab">
          <i class="bi bi-card-list"></i>
          <span>Composición de Productos</span>
        </RouterLink>

        <RouterLink to="/costeo" class="tab">
          <i class="bi bi-coin"></i>
          <span>Costeo</span>
        </RouterLink>
      </nav>
    </header>
 
    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
body {
  background-color: #f2f2f2;
}

.app-layout {
  display: flex;
  min-height: 100vh;
  align-items: stretch;
}

header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 220px;
  flex-shrink: 0;
  background-color: #e9e9e9;
  border-right: 1px solid #bbbbbb;
  box-shadow: 1px 0 2px rgba(0, 0, 0, 0.08);
  padding: 1rem 0;
}

img {
  width: 95%;
  height: auto;
  margin: 0 auto 1rem auto;
}

nav {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.tab {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 1.2rem;
  color: #555555;
  text-decoration: none;
  font-size: 0.95rem;
  border-left: 3px solid transparent;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.tab i {
  font-size: 1.2rem;
  color: #a60808;
  width: 1.2rem;
  text-align: center;
}

.tab:hover {
  background-color: #f5dede;
  color: #ff1818;
}

.tab.router-link-active {
  color: #ff1818;
  border-left-color: #ff1818;
  background-color: #f5dede;
  font-weight: 600;
}

.app-content {
  flex: 1;
  min-width: 0;
}

.toggle-tab {
  cursor: pointer;
  justify-content: flex-start;
}

.menu_desp {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.menu_desp.abierto {
  max-height: 200px;
}

.sub-tab {
  padding-left: 2.4rem;
  font-size: 0.88rem;
}

.no-print {
    display: none !important;
}

</style>
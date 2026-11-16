<script setup>
import { ref, computed, onMounted } from 'vue'

const productos = ref([])
const cargando = ref(false)
const precioDolar = ref(0)

const familiasSeleccionadas = ref([]) // [] = todas las familias
const busqueda = ref('')

async function cargarProductos() {
  cargando.value = true
  try {
    const res = await fetch('http://localhost:3000/modulouno')
    if (!res.ok) throw new Error('Error al obtener los productos')
    productos.value = await res.json()
  } catch (err) {
    console.error(err)
    alert('Hubo un error al cargar los insumos.')
  } finally {
    cargando.value = false
  }
}

async function cargarCotizacionDolar() {
  try {
    const res = await fetch('http://localhost:3000/dolar')
    if (res.ok) {
      const data = await res.json()
      precioDolar.value = Number(data.precioDolar) || 0
    }
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  cargarProductos()
  cargarCotizacionDolar()
})

// Lista de familias únicas (para el <select>)
const familias = computed(() => {
  const mapa = new Map()
  for (const p of productos.value) {
    if (!mapa.has(p.CodArtPatron)) {
      mapa.set(p.CodArtPatron, p.DetalleArtPatron)
    }
  }
  return Array.from(mapa.entries())
    .map(([CodArtPatron, DetalleArtPatron]) => ({ CodArtPatron, DetalleArtPatron }))
    .sort((a, b) => a.CodArtPatron.localeCompare(b.CodArtPatron))
})

// Artículos que quedan después de aplicar familia + búsqueda
const itemsFiltrados = computed(() => {
  let base = productos.value

    if (familiasSeleccionadas.value.length > 0) {
    base = base.filter(p => familiasSeleccionadas.value.includes(p.CodArtPatron))
  }

  const termino = busqueda.value.trim().toLowerCase()
  if (termino) {
    base = base.filter(p =>
      String(p.CodArticulo ?? '').toLowerCase().includes(termino) ||
      String(p.DetalleArticulo ?? '').toLowerCase().includes(termino)
    )
  }

  return base
})

// Agrupa lo filtrado por familia: una "hoja" impresa por cada familia
// (si elegiste una familia puntual, va a ser una sola hoja)
const gruposParaImprimir = computed(() => {
  const mapa = new Map()

  for (const it of itemsFiltrados.value) {
    if (!mapa.has(it.CodArtPatron)) {
      mapa.set(it.CodArtPatron, {
        codigo: it.CodArtPatron,
        detalle: it.DetalleArtPatron,
        items: []
      })
    }
    mapa.get(it.CodArtPatron).items.push(it)
  }

  return Array.from(mapa.values())
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map(grupo => ({
      ...grupo,
      totalPesos: grupo.items.reduce((acc, it) => acc + Number(it.Pesos || 0), 0)
    }))
})

function toggleFamilia(cod) {
  const idx = familiasSeleccionadas.value.indexOf(cod)
  if (idx === -1) {
    familiasSeleccionadas.value.push(cod)
  } else {
    familiasSeleccionadas.value.splice(idx, 1)
  }
}

function limpiarFamilias() {
  familiasSeleccionadas.value = []
}

const fechaImpresion = computed(() => new Date().toLocaleDateString('es-AR'))

function imprimir() {
  window.print()
}
</script>

<template>
  <div class="reporte-app">
    <header class="app-header">
      <p class="eyebrow">Insumos</p>
      <h1 class="titulo-principal">Reporte</h1>
    </header>

    <div class="pantalla">
      <div class="card reporte">
        <h2 class="card-title">Configurar reporte</h2>

        <form class="form-grid" style="display: block;" @submit.prevent>
                    <div class="field field-familias">
                        <label>Familias</label>
                        <div class="familias-lista">
                        <label
                            v-for="f in familias"
                            style="margin-bottom: 2%; font-size: 95%;"
                            :key="f.CodArtPatron"
                            class="familia-chip"
                            :class="{ activa: familiasSeleccionadas.includes(f.CodArtPatron) }"
                        >
                            <input
                                type="checkbox"
                                style="width: 25%;"
                                :value="f.CodArtPatron"
                                :checked="familiasSeleccionadas.includes(f.CodArtPatron)"
                                @change="toggleFamilia(f.CodArtPatron)"
                            >
                            {{ f.CodArtPatron }} — {{ f.DetalleArtPatron }}
                        </label>
                    </div>
                    <button
                        v-if="familiasSeleccionadas.length"
                        type="button"
                        class="btn btn-ghost btn-sm"
                        @click="limpiarFamilias"
                    >
                        Limpiar selección
                    </button>
                </div>

          <div class="field">
            <label for="buscar">Buscar (opcional)</label>
            <input
              type="text"
              id="buscar"
              v-model="busqueda"
              placeholder="Código o detalle de artículo"
            >
          </div>
        </form>

        <p class="contador-info" v-if="!cargando">
          {{ itemsFiltrados.length }} artículo(s) encontrados
          <span v-if="precioDolar"> · Cotización: ${{ precioDolar.toFixed(2) }}</span>
        </p>

        <div class="lote-nav no-print">
          <button
            class="btn btn-primary btn-imprimir"
            type="button"
            :disabled="itemsFiltrados.length === 0"
            @click="imprimir"
          >
            Imprimir
          </button>
          <button
            class="btn btn-outline"
            style="margin-top: -7%;"
            type="button"
            @click="cargarProductos"
            :disabled="cargando"
          >
            {{ cargando ? 'Actualizando…' : 'Actualizar datos' }}
          </button>
        </div>
      </div>
    </div>

    <div class="vp">
      <h2 class="card-title vp-title">Vista previa</h2>

      <p v-if="cargando" class="placeholder">Cargando…</p>
      <p v-else-if="itemsFiltrados.length === 0" class="placeholder">
        No hay artículos que coincidan con los filtros elegidos.
      </p>

      <div id="impresion" class="impresion">
        <div class="hoja" v-for="grupo in gruposParaImprimir" :key="grupo.codigo">
          <div class="hoja-header">
            <div class="logo">
              <img src="../assets/logopsf.png" alt="psf">
            </div>
            <div class="titulo">
              <p class="titulo-orden">Reporte de insumos</p>
              <p class="numero-orden">Familia {{ grupo.codigo }}</p>
              <p class="fecha-orden">{{ fechaImpresion }}</p>
            </div>
          </div>

          <div class="hoja-datos">
            <div class="fila cliente-etiqueta-obs">
              <span class="etq">Detalle de familia:</span> {{ grupo.detalle }}
            </div>
            <div class="fila orden-vendedor">
              <span class="etq">Artículos:</span> {{ grupo.items.length }}
            </div>
          </div>

          <table class="tabla-orden">
            <thead>
              <tr>
                <th>Familia</th>
                <th>Cód. artículo</th>
                <th>Detalle</th>
                <th>Pesos</th>
                <th>Dólares</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in grupo.items" :key="it.CodArticulo">
                <td>{{ it.CodArtPatron }}</td>
                <td>{{ it.CodArticulo }}</td>
                <td style="text-align:left;">{{ it.DetalleArticulo }}</td>
                <td>{{ Number(it.Pesos).toFixed(2) }}</td>
                <td>{{ Number(it.Dolares).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="atajos-flotante no-print">
      <p class="atajos-titulo">Atajos</p>
      <p><kbd>Ctrl</kbd> + <kbd>P</kbd> imprimir</p>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.reporte-app {
  --ink: #221f1e;
  --ink-soft: #6e6360;
  --surface: #ffffff;
  --bg: #f2efee;
  --line: #ddd6d4;
  --accent: #c1272d;
  --accent-dark: #8c1b1f;
  --accent-soft: #f7e6e5;
  --danger: #8c1b1f;
  --danger-soft: #f7e6e5;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(34, 31, 30, 0.07), 0 10px 30px -14px rgba(34, 31, 30, 0.26);
  --font-display: 'Barlow Semi Condensed', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  font-family: var(--font-body);
  color: var(--ink);
  background: var(--bg);
  min-height: 100vh;
  padding-bottom: 3rem;
}

img {
  width: 160px;
  height: auto;
  margin: 0 auto 1rem auto;
  margin-left: -1%;
}

td{
  height: 30px;
}

.reporte-app * {
  box-sizing: border-box;
}

/* Header */

.app-header {
  text-align: center;
  padding: 3rem 1.5rem 1.75rem;
}

.eyebrow {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-dark);
  margin: 0 0 0.4rem;
}

.titulo-principal {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.1rem, 5vw, 3rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink);
  margin: 0;
  padding-bottom: 0.7rem;
  position: relative;
  display: inline-block;
}

.titulo-principal::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 4.5rem;
  height: 0.3rem;
  border-radius: 999px;
  background: var(--accent);
}

.numero-badge {
  font-family: var(--font-body);
  font-size: 1.05rem;
  color: var(--ink);
  margin: 1rem 0 0;
}

.numero-badge strong {
  color: var(--accent-dark);
}

/* Cards */

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.card-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line);
}

/* Atajo flotante */

.atajos-flotante {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.9rem 1.1rem;
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--ink);
  line-height: 1.6;
  z-index: 50;
}

.atajos-flotante .atajos-titulo {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--ink-soft);
  margin: 0 0 0.4rem;
}

.atajos-flotante p {
  margin: 0.15rem 0;
}

.atajos-flotante kbd {
  font-family: var(--font-mono);
  background: var(--accent);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.05rem 0.4rem;
  font-size: 0.78rem;
}

/* Contador panel */

.contador-panel {
  display: block;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1rem;
  width: fit-content;
  width: 25%;
  margin: 0 auto 2.5rem;
  padding: 1.1rem 1.75rem;
}

.contador-panel .field-inline {
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
}

.contador-panel .field-inline label {
  margin: 0;
}

.contador-panel .field-inline input {
  width: 90px;
  margin: 0;
}

.contador-info {
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--ink);
  display: inline-block;
  margin-right: 0.8rem;
  justify-content: center;
}

.lote-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--ink);
}

.sa-reporte {
  display: inline;
}

/* Fecha día/mes */

.fecha-dm {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.fecha-dm input {
  width: auto;
  flex: 1;
}

.separador-fecha {
  font-family: var(--font-mono);
  color: var(--ink-soft);
  font-weight: 600;
}

/* Buttons */



.btn {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  font-size: 0.92rem;
  padding: 0.7rem 1.4rem;
  border-radius: 8px;
  border: 1.5px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.btn-primary {
  background: var(--accent);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--accent-dark);
  transform: translateY(-1px);
}

.btn-outline {
  background: var(--surface);
  border-color: var(--ink-soft);
  color: var(--ink);
}

.btn-outline:hover {
  border-color: var(--accent);
  color: var(--accent-dark);
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--ink-soft);
}

.btn-ghost:hover {
  color: var(--danger);
}

.btn-sm {
  padding: 0.4rem 0.85rem;
  font-size: 0.9rem;
}

.btn:focus-visible,
input:focus-visible {
  outline: 3px solid var(--accent-dark);
  outline-offset: 2px;
}

.btn-imprimir {
  margin-bottom: 2rem;
}

/* Form */

.panel-atajos {
  flex-shrink: 0;
  width: 250px;
  position: sticky;
  top: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 1.25rem;
  text-align: center;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem 1.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field label {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
  margin: 0;
}

.field select {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  margin: 0;
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.familias-lista {
  display: block;
  flex-wrap: wrap;
  gap: 1rem;
  max-height: 230px;
  overflow-y: auto;
  padding: 0.5rem;
  border-radius: 8px;
  margin-bottom: 2%;
  border: 0.05rem solid var(--line);
}

.familia-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  cursor: pointer;
  
}

.familia-chip.activa {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-dark);
}

input {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  margin: 0;
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

input:disabled {
  background-color: var(--bg);
  color: var(--ink-soft);
  cursor: not-allowed;
}

.form-submit {
  grid-column: 1 / -1;
  justify-self: start;
  margin-top: 0.4rem;
}

/* Layout: pantalla (formulario + calculadora) */

.pantalla {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 2rem;
  flex-wrap: wrap;
  max-width: 1100px;
  margin: 0 auto 3rem;
  padding: 0 1.5rem;
}

.card.reporte {
  flex: 1 1 400px;
  max-width: 520px;
  padding: 1.75rem 2rem;
}

.fullcalcu {
  flex: 1 1 320px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.card.fcalcu {
  padding: 1.75rem 2rem;
}

.card.resultado {
  display: flex;
  justify-content: space-around;
  align-items: stretch;
  padding: 1.5rem 1rem 1.25rem;
  text-align: center;
  gap: 0;
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%);
}

.resultado-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  position: relative;
}


.resultado-label {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 1000;
  font-size: 0.72rem;
  color: rgb(57, 57, 57);
}

.resultado-valor {
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--accent-dark);
  background: var(--accent-soft);
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  min-width: 3.2rem;
  line-height: 1.3;
}

/* Vista previa / impresión */

.vp {
  max-width: 1100px;
  margin: 0 auto 4rem;
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.vp-title {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 1.25rem;
}

.impresion {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
}

.placeholder {
  color: var(--ink-soft);
  font-style: italic;
  text-align: center;
}

.hoja {
  position: relative;
  width: 200mm;
  min-height: 230mm;
  background: #ffffff;
  padding: 2rem 2.5rem;
  box-sizing: border-box;
  font-family: var(--font-body), Arial, Helvetica, sans-serif;
  color: #000;
  box-shadow: var(--shadow);
}


.hoja-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
  margin-bottom: 12px;
  margin-top: 5px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-psf {
  background-color: var(--accent);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  padding: 4px 8px;
  border-radius: 3px;
  letter-spacing: 1px;
}

.logo-texto {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  line-height: 1.2;
}

.logo-texto strong {
  font-size: 12px;
}

.titulo {
  text-align: right;
}

.titulo-orden {
  margin: 0;
  font-size: 20px;
  text-align: right;
}

.numero-orden {
  margin: 2px 0 0 0;
  font-weight: bold;
  font-size: 15px;
}

.fecha-orden {
  margin: 0;
  font-size: 14px;
  color: #444;
}

.hoja-datos {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 4px 12px;
  font-size: 16px;
  margin-bottom: 14px;
}

.hoja-datos .fila {
  display: block;
}

.hoja-datos .derecha {
  text-align: left;
  margin-right: 0.5rem;
}

.cliente-etiqueta-obs{
  display: block;
  width: 100%;
  min-width: 0;
}

.orden-vendedor{
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.fila{
  margin-top: 2%;
}

.etq {
  font-weight: bold;
  font-size: 16px;
  margin-right: 4px;
}

.numfila {
  font-weight: bold;
  margin-right: 4px;
  font-size: 16px;
  font-family: var(--font-body);
}

.stock {
  margin-left: 8px;
  font-weight: bold;
}

.tabla-orden {
  width: 170mm;
  min-height: 150mm;
  border-collapse: collapse;
  font-size: 16px;
  margin-bottom: 15px;
  align-items: stretch;
  margin-left: 2.5%;  
}

.tabla-orden th,
.tabla-orden td {
  border: 1px solid #000;
  padding: 4px 2px;
  text-align: center;
}

.tabla-orden th {
  background-color: #f0f0f0;
  font-size: 10px;
}

.tabla-orden td.cantidad {
  font-size: 16px;
  font-weight: bold;
}

.hoja-footer {
  display: flex;
  justify-content: space-between;
  font-size: 20px;
  border-top: 1px solid #000;
  padding-top: 8px;
}

.totalkg{
  margin-right: 5rem;
}

.sello-duplicado {
  justify-content: end;
  text-align: center;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 2px;
  margin-top: 5px;
}

/* Responsive */



.pdf-render .hoja {
  box-shadow: none;
}

#impresion.pdf-render {
  gap: 0;   /* el espacio entre hojas para el PDF lo da el margen del PDF, no este gap */
}

@media (max-width: 640px) {
  .atajos-flotante {
    bottom: 0.75rem;
    right: 0.75rem;
    left: 0.75rem;
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reporte-app *,
  .reporte-app *::before,
  .reporte-app *::after {
    transition: none !important;
    animation: none !important;
  }
}

/* Solo se imprime el contenedor #impresion, con cada hoja en su propia página */

@media print {
  body * {
    visibility: hidden;
  }

  #impresion,
  #impresion * {
    visibility: visible;
  }

  #impresion {
    position: absolute;
    top: 0;
    left: 0;
    width: 210mm;   /* antes: 100% */
    gap: 0;
  }

  .no-print {
    display: none !important;
  }

  .hoja {
    box-shadow: none;
    page-break-after: always;
    width: 200mm;    /* antes: 100% — mismo ancho que en pantalla */
    margin: 0 auto;
  }

  .hoja:last-child {
    page-break-after: auto;
  }

  .tabla-orden thead {
    display: table-header-group;
  }

  .tabla-orden tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  @page {
    size: custom 210mm 297mm;
    margin: 0;        /* antes: 12mm */
  }
}
</style>
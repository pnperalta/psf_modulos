<script setup>

import { ref, reactive, computed, onMounted } from 'vue'

const precioDolar = ref(0)

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

// Carga silenciosa de productos, sin tocar mostrandoProductos.
// Sirve para tener datos disponibles para el autocompletado de familia
// aunque el usuario todavía no haya apretado "Mostrar productos".
async function cargarProductos() {
  cargando.value = true

  try {
    const res = await fetch('http://localhost:3000/modulouno')

    if (!res.ok) throw new Error('Error al obtener los productos')

    productos.value = await res.json()
    mostrandoProductos.value = true
  } catch (err) {
    console.error(err)
    alert('Hubo un error al cargar los productos.')
  } finally {
    cargando.value = false
  }
}

function calcularDolares(pesos) {
  if (!precioDolar.value) return 0
  return Math.round((Number(pesos) / precioDolar.value) * 100) / 100
}

function calcularPesos(dolares) {
  return Math.round((Number(dolares) * precioDolar.value) * 100) / 100
}

// --- Nuevo producto: conversión bidireccional ---
function onPesosInputNuevo(valor) {
  const pesos = parseFloat(valor) || 0
  nuevoProducto.Pesos = pesos
  nuevoProducto.Dolares = calcularDolares(pesos)
}
function onDolaresInputNuevo(valor) {
  const dolares = parseFloat(valor) || 0
  nuevoProducto.Dolares = dolares
  nuevoProducto.Pesos = calcularPesos(dolares)
}

// --- Edición de fila: conversión bidireccional ---
function onPesosInputEdicion(valor) {
  const pesos = parseFloat(valor) || 0
  edicionProducto.Pesos = pesos
  edicionProducto.Dolares = calcularDolares(pesos)
}
function onDolaresInputEdicion(valor) {
  const dolares = parseFloat(valor) || 0
  edicionProducto.Dolares = dolares
  edicionProducto.Pesos = calcularPesos(dolares)
}

onMounted(() => {
  cargarCotizacionDolar()
  cargarProductos()
})

const productos = ref([])
const mostrandoProductos = ref(false)
const mostrandoFormulario = ref(false)
const cargando = ref(false)
const editandoProducto = ref(null) // guarda { CodArtPatron, CodArticulo } de la fila en edición
const edicionProducto = reactive({ DetalleArtPatron: '', DetalleArticulo: '', Pesos: 0, Dolares: 0 })
const busqueda = ref('')

const productosFiltrados = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  if (!termino) return productos.value

  return productos.value.filter(p => {
    return (
      String(p.CodArtPatron ?? '').toLowerCase().includes(termino) ||
      String(p.DetalleArtPatron ?? '').toLowerCase().includes(termino) ||
      String(p.DetalleArticulo ?? '').toLowerCase().includes(termino) ||
      String(p.CodArticulo ?? '').toLowerCase().includes(termino)
    )
  })
})

// --- Autocompletado de familia (CodArtPatron) para producto nuevo ---
function detalleFamiliaExistente(codigo) {
  if (!codigo) return null
  const cod = String(codigo).trim().toUpperCase()
  if (!cod) return null
  const encontrado = productos.value.find(
    p => String(p.CodArtPatron ?? '').toUpperCase() === cod
  )
  return encontrado ? encontrado.DetalleArtPatron : null
}

const familiaExistente = computed(() => detalleFamiliaExistente(nuevoProducto.CodArtPatron))

function onCodArtPatronInput(valor) {
  const codigo = valor.toUpperCase()
  nuevoProducto.CodArtPatron = codigo

  const detalle = detalleFamiliaExistente(codigo)
  if (detalle) {
    nuevoProducto.DetalleArtPatron = detalle
  }
}

function empezarEdicionProducto(p) {
  // CodArtPatron y CodArticulo NUNCA se tocan: solo se usan para ubicar la fila
  editandoProducto.value = { CodArtPatron: p.CodArtPatron, CodArticulo: p.CodArticulo }
  edicionProducto.DetalleArtPatron = p.DetalleArtPatron
  edicionProducto.DetalleArticulo = p.DetalleArticulo
  edicionProducto.Pesos = p.Pesos
  edicionProducto.Dolares = p.Dolares
}

function cancelarEdicionProducto() {
  editandoProducto.value = null
}

function esFilaEnEdicion(p) {
  return editandoProducto.value
    && editandoProducto.value.CodArtPatron === p.CodArtPatron
    && editandoProducto.value.CodArticulo === p.CodArticulo
}

async function guardarEdicionProducto() {
  const { CodArtPatron, CodArticulo } = editandoProducto.value // claves fijas, para ubicar la fila
  cargando.value = true
  try {
    const res = await fetch(`http://localhost:3000/modulouno/${CodArtPatron}/${CodArticulo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        DetalleArtPatron: edicionProducto.DetalleArtPatron,
        DetalleArticulo: edicionProducto.DetalleArticulo,
        Pesos: edicionProducto.Pesos,
        Dolares: edicionProducto.Dolares
      })
    })

    if (!res.ok) throw new Error('Error al actualizar el producto')

    const prod = productos.value.find(p => p.CodArtPatron === CodArtPatron && p.CodArticulo === CodArticulo)
    if (prod) {
      prod.DetalleArtPatron = edicionProducto.DetalleArtPatron
      prod.DetalleArticulo = edicionProducto.DetalleArticulo
      prod.Pesos = edicionProducto.Pesos
      prod.Dolares = edicionProducto.Dolares
    }

    editandoProducto.value = null
    alert('Producto actualizado correctamente.')
  } catch (err) {
    console.error(err)
    alert('Hubo un error al actualizar el producto.')
  } finally {
    cargando.value = false
  }
}

async function eliminarProducto(p) {
  const confirmar = confirm(`¿Eliminar el producto ${p.CodArticulo} de la familia ${p.CodArtPatron}?`)
  if (!confirmar) return

  cargando.value = true
  try {
    const res = await fetch(`http://localhost:3000/modulouno/${p.CodArtPatron}/${p.CodArticulo}`, {
      method: 'DELETE'
    })

    if (!res.ok) throw new Error('Error al eliminar el producto')

    productos.value = productos.value.filter(
      x => !(x.CodArtPatron === p.CodArtPatron && x.CodArticulo === p.CodArticulo)
    )

    alert('Producto eliminado correctamente.')
  } catch (err) {
    console.error(err)
    alert('Hubo un error al eliminar el producto.')
  } finally {
    cargando.value = false
  }
}

const nuevoProducto = reactive({
  CodArtPatron: '',
  DetalleArtPatron: '',
  DetalleArticulo: '',
  CodArticulo: '',
  Pesos: 0,
  Dolares: 0,
})

async function toggleMostrarProductos() {
  if (mostrandoProductos.value) {
    mostrandoProductos.value = false
    return
  }

  cargando.value = true

  try {
    const res = await fetch('http://localhost:3000/modulouno')

    if (!res.ok) throw new Error('Error al obtener los productos')

    productos.value = await res.json()
    mostrandoProductos.value = true
  } catch (err) {
    console.error(err)
    alert('Hubo un error al cargar los productos.')
  } finally {
    cargando.value = false
  }
}

function toggleFormulario() {
  mostrandoFormulario.value = !mostrandoFormulario.value
}

async function agregarProducto() {
  if (!nuevoProducto.CodArtPatron || !nuevoProducto.DetalleArtPatron || !nuevoProducto.DetalleArticulo || !nuevoProducto.CodArticulo) {
    alert('Completá los campos de código y detalle')
    return
  }

  cargando.value = true

  try {
    const res = await fetch('http://localhost:3000/modulouno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nuevoProducto })
    })
    if (!res.ok) throw new Error('Error al guardar el producto')

    await res.json()

    nuevoProducto.CodArtPatron = ''
    nuevoProducto.DetalleArtPatron = ''
    nuevoProducto.DetalleArticulo = ''
    nuevoProducto.CodArticulo = ''
    nuevoProducto.Pesos = 0
    nuevoProducto.Dolares = 0

    mostrandoFormulario.value = false
    alert('Producto agregado correctamente.')

    // Refrescamos la lista de productos (para tabla y para el autocompletado)
    await cargarProductos()
    if (mostrandoProductos.value) {
      mostrandoProductos.value = true
    }
  } catch (err) {
    console.error(err)
    alert('Hubo un error al agregar el producto (¿ese código ya existe en esa familia?).')
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="productos-app">
    <header class="app-header">
      <h1 class="titulo-principal" style="margin-top: 1%;">Insumos</h1>
    </header>

    <div class="toolbar">
      <button class="btn btn-primary" @click="toggleFormulario">
        {{ mostrandoFormulario ? 'Cancelar' : '+ Agregar producto' }}
      </button>
      <button class="btn btn-outline" @click="toggleMostrarProductos">
        {{ mostrandoProductos ? 'Ocultar productos' : 'Mostrar productos' }}
      </button>
    </div>

    <transition name="fade">
      <div v-if="mostrandoFormulario" class="card form-card">
        <h2 class="card-title">Nuevo producto</h2>
        <form @submit.prevent="agregarProducto" class="form-grid">
          <div class="field">
            <label for="codArtPatron">Cód. familia (CodArtPatron)</label>
            <input type="text" id="codArtPatron" :value="nuevoProducto.CodArtPatron"
              @input="onCodArtPatronInput($event.target.value)"
              @keyup.enter="irCampoSiguiente('detalleArtPatron')"
              placeholder="Ej. C-1">
            <p v-if="familiaExistente" class="hint-familia">
              ✓ Familia existente — se autocompletó el detalle
            </p>
          </div>

          <div class="field">
            <label for="detalleArtPatron">Detalle de familia</label>
            <input type="text" id="detalleArtPatron" :value="nuevoProducto.DetalleArtPatron"
              @input="nuevoProducto.DetalleArtPatron = $event.target.value.toUpperCase()"
              @keyup.enter="irCampoSiguiente('codArticulo')"
              :readonly="!!familiaExistente"
              :class="{ 'input-readonly': familiaExistente }"
              placeholder="Ej. MATERIAS PRIMAS PRINCIPALES">
          </div>

          <div class="field">
            <label for="codArticulo">Cód. artículo</label>
            <input type="text" id="codArticulo" :value="nuevoProducto.CodArticulo"
              @input="nuevoProducto.CodArticulo = $event.target.value"
              @keyup.enter="irCampoSiguiente('detalleArticulo')"
              placeholder="Ej. 001">
          </div>

          <div class="field">
            <label for="detalleArticulo">Detalle de artículo</label>
            <input type="text" id="detalleArticulo" :value="nuevoProducto.DetalleArticulo"
              @input="nuevoProducto.DetalleArticulo = $event.target.value.toUpperCase()"
              @keyup.enter="irCampoSiguiente('pesos')"
              placeholder="Ej. RESINA PRINGLES">
          </div>

          <div class="field">
            <label for="pesos">Pesos</label>
            <input type="number" step="0.01" id="pesos" :value="nuevoProducto.Pesos"
              @input="onPesosInputNuevo($event.target.value)" @keyup.enter="irCampoSiguiente('dolares')"
              placeholder="0.00">
          </div>

          <div class="field">
            <label for="dolares">Dólares</label>
            <input type="number" step="0.01" id="dolares" :value="nuevoProducto.Dolares"
              @input="onDolaresInputNuevo($event.target.value)" @keyup.enter="irCampoSiguiente('submit')"
              placeholder="0.00">
          </div>

          <button class="btn btn-primary form-submit" type="submit" :disabled="cargando">
            {{ cargando ? 'Guardando…' : 'Guardar producto' }}
          </button>
        </form>
      </div>
    </transition>

    <div class="panel">
      <p v-if="cargando" class="state-msg">Cargando…</p>

      <div v-else-if="mostrandoProductos">
        <div class="search-bar">
          <input type="text" v-model="busqueda" placeholder="Buscar..." class="search-input">
          <button v-if="busqueda" class="btn btn-sm btn-ghost" @click="busqueda = ''" type="button">
            Limpiar
          </button>
        </div>

        <div v-if="productos.length === 0" class="empty-state">
          <p>No hay productos registrados todavía.</p>
        </div>

        <div v-else-if="productosFiltrados.length === 0" class="empty-state">
          <p>No se encontraron productos que coincidan con "{{ busqueda }}".</p>
        </div>

        <div>
          <p v-if="precioDolar" style="text-align:center; color: var(--ink-soft); font-size: .85rem;">
            Cotización usada: ${{ precioDolar.toFixed(2) }}
          </p>
        </div>

        <div class="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cód. familia</th>
                <th>Detalle de familia</th>
                <th>Detalle de artículo</th>
                <th>Cód. artículo</th>
                <th>Pesos</th>
                <th>Dólares</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in productosFiltrados" :key="p.CodArtPatron + '-' + p.CodArticulo">
                <td><span class="code-chip">{{ p.CodArtPatron }}</span></td>

                <template v-if="esFilaEnEdicion(p)">
                  <td><input type="text" :value="edicionProducto.DetalleArtPatron"
                    @input="edicionProducto.DetalleArtPatron = $event.target.value.toUpperCase()"
                    @keyup.enter="guardarEdicionProducto"></td>
                  <td><input type="text" :value="edicionProducto.DetalleArticulo"
                    @input="edicionProducto.DetalleArticulo = $event.target.value.toUpperCase()"
                    @keyup.enter="guardarEdicionProducto"></td>
                  <td><span class="code-chip">{{ p.CodArticulo }}</span></td>
                  <td><input type="number" step="0.01" :value="edicionProducto.Pesos"
                    @input="onPesosInputEdicion($event.target.value)"
                    @keyup.enter="guardarEdicionProducto"></td>
                  <td><input type="number" step="0.01" :value="edicionProducto.Dolares"
                    @input="onDolaresInputEdicion($event.target.value)"
                    @keyup.enter="guardarEdicionProducto"></td>
                  <td class="actions-cell">
                    <button @click="guardarEdicionProducto" class="btn btn-sm btn-primary">Guardar</button>
                    <button @click="cancelarEdicionProducto" class="btn btn-sm btn-ghost">Cancelar</button>
                  </td>
                </template>

                <template v-else>
                  <td>{{ p.DetalleArtPatron }}</td>
                  <td>{{ p.DetalleArticulo }}</td>
                  <td><span class="code-chip">{{ p.CodArticulo }}</span></td>
                  <td>{{ Number(p.Pesos).toFixed(2) }}</td>
                  <td>{{ Number(p.Dolares).toFixed(2) }}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-outline" @click="empezarEdicionProducto(p)">Editar</button>
                    <button class="btn btn-sm btn-ghost" @click="eliminarProducto(p)">Eliminar</button>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>Presioná "Mostrar productos" para ver la lista.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.productos-app {
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

html.dark .productos-app {
  --ink: #d6d6d6;
  --ink-soft: #a4a4a4;
  --surface: #1e1e1e;
  --bg: #141414;
  --line: #333333;
  --accent: #ff6b6b;
  --accent-dark: #ff8787;
  --accent-soft: #3a1f1f;
  --danger: #ff8787;
  --danger-soft: #3a1f1f;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -14px rgba(0, 0, 0, 0.6);
}

.productos-app * {
  box-sizing: border-box;
}

.titulo-principal {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 700;
  font-size: clamp(2.1rem, 5vw, 3rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink);
  margin: 0;
  padding-bottom: 0.7rem;
  position: relative;
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

/* Header */

.app-header {
  text-align: center;
  padding: 3rem 1.5rem 1.75rem;
}

.app-header h1 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2rem, 4vw, 2.75rem);
  letter-spacing: 0.01em;
  margin: 0;
  color: var(--ink);
}

/* Toolbar */

.toolbar {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0 1.5rem 0.5rem;
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

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-primary {
  background: var(--accent);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-dark);
  transform: translateY(-1px);
}

.btn-outline {
  background: var(--surface);
  border-color: var(--line);
  color: var(--ink);
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-dark);
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--ink-soft);
}

.btn-ghost:hover:not(:disabled) {
  color: var(--danger);
}

.btn-sm {
  padding: 0.4rem 0.85rem;
  font-size: 0.78rem;
}

.btn:focus-visible,
input:focus-visible {
  outline: 3px solid var(--accent-dark);
  outline-offset: 2px;
}

/* Cards */

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.form-card {
  max-width: 640px;
  margin: 1.75rem auto 0;
  padding: 1.75rem 2rem;
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

/* Form */

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

.form-submit {
  grid-column: 1 / -1;
  justify-self: start;
  margin-top: 0.4rem;
}

.hint-familia {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--accent-dark);
}

.input-readonly {
  background: var(--bg);
  color: var(--ink-soft);
  cursor: not-allowed;
}

/* Panel / states */

.panel {
  max-width: 1200px;
  margin: 2.25rem auto 0;
  padding: 0 1.5rem;
}

.state-msg {
  text-align: center;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.85rem;
  color: var(--ink-soft);
  padding: 2rem 0;
}

.empty-state {
  text-align: center;
  padding: 3.5rem 1.5rem;
  color: var(--ink-soft);
  background: var(--surface);
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
  font-size: 1rem;
}

.empty-state p {
  margin: 0;
}

/* Table */

.table-wrap {
  overflow-x: auto;
  overflow-y: hidden;
}

table {
  width: 100%;
  min-width: 780px;
  border-collapse: collapse;
  font-family: var(--font-body);
}

thead th {
  background: var(--ink);
  color: var(--surface);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  font-size: 0.8rem;
  text-align: left;
  padding: 0.9rem 1.1rem;
  position: sticky;
  top: 0;
}

tbody td {
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.92rem;
  color: var(--ink);
}

tbody tr:nth-child(even) {
  background: var(--bg);
}

tbody tr:hover {
  background: var(--accent-soft);
}

tbody tr:last-child td {
  border-bottom: none;
}

.code-chip {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--accent-dark);
  background: var(--accent-soft);
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  letter-spacing: 0.02em;
}

.actions-cell {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

td input {
  font-size: 0.88rem;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
}

/* Transitions */

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Responsive */

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-card {
    padding: 1.25rem;
    margin: 1.5rem 1rem 0;
  }

  .panel {
    padding: 0 1rem;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 0 1.5rem 0.5rem;
  }

  .btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .productos-app *,
  .productos-app *::before,
  .productos-app *::after {
    transition: none !important;
    animation: none !important;
  }
}

.search-bar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1.25rem;
}

.search-input {
  width: 50%;
  justify-self: center;
}
</style>
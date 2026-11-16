<script setup>
import { ref, computed, onMounted } from 'vue'
import XLSX from 'xlsx-js-style'

const API = 'http://localhost:3000'

const insumos = ref([])     // /modulouno
const formulas = ref([])    // /formulas
const productos = ref([])   // /productos-terminados
const entradas = ref({})    // `${CodProducto}::${Tipo}::${CodComponente}` -> porcentaje (número)

const cargando = ref(false)
const error = ref('')

const claveCelda = (cod, tipo, comp) => `${cod}::${tipo}::${comp}`
const redondear = n => Math.round(n * 100) / 100
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })

async function cargarTodo() {
  cargando.value = true
  error.value = ''
  try {
    const [rI, rF, rP, rD] = await Promise.all([
      fetch(`${API}/modulouno`),
      fetch(`${API}/formulas`),
      fetch(`${API}/productos-terminados`),
      fetch(`${API}/productos-terminados/detalle`)
    ])
    if (!rI.ok) throw new Error('insumos')
    insumos.value = await rI.json()
    formulas.value = rF.ok ? await rF.json() : []
    productos.value = rP.ok ? await rP.json() : []
    const detalle = rD.ok ? await rD.json() : []

    const nuevas = {}
    for (const d of detalle) {
      nuevas[claveCelda(d.CodProducto, d.Tipo, d.CodComponente)] = Number(d.Porcentaje)
    }
    entradas.value = nuevas
  } catch (err) {
    console.error(err)
    error.value = 'No se pudieron cargar los datos.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargarTodo)

// ---------- Columnas: todas las fórmulas + todos los insumos ----------
const busquedaColumna = ref('')
const filtroTipo = ref('todos') // todos | formula | insumo

const columnasTodas = computed(() => {
  const cols = []
  const fs = [...formulas.value].sort((a, b) => Number(a.CodFormula) - Number(b.CodFormula))
  for (const f of fs) cols.push({ tipo: 'formula', cod: String(f.CodFormula), nombre: f.Nombre })

  const vistos = new Set()
  const ins = []
  for (const i of insumos.value) {
    if (vistos.has(i.CodArticulo)) continue
    vistos.add(i.CodArticulo)
    ins.push(i)
  }
  ins.sort((a, b) => natural(a.CodArticulo, b.CodArticulo))
  for (const i of ins) cols.push({ tipo: 'insumo', cod: String(i.CodArticulo), nombre: i.DetalleArticulo })
  return cols
})

const columnas = computed(() => {
  const t = busquedaColumna.value.trim().toLowerCase()
  return columnasTodas.value.filter(c => {
    if (filtroTipo.value !== 'todos' && c.tipo !== filtroTipo.value) return false
    if (!t) return true
    return c.cod.toLowerCase().includes(t) || String(c.nombre ?? '').toLowerCase().includes(t)
  })
})

function nombreComponente(tipo, cod) {
  const c = columnasTodas.value.find(x => x.tipo === tipo && x.cod === String(cod))
  return c ? c.nombre : '(ya no existe)'
}

// ---------- Filas: productos terminados ----------
const busquedaProducto = ref('')

const filas = computed(() => {
  const t = busquedaProducto.value.trim().toLowerCase()
  const lista = t
    ? productos.value.filter(p =>
        String(p.CodProducto).toLowerCase().includes(t) ||
        String(p.Nombre ?? '').toLowerCase().includes(t))
    : productos.value
  return [...lista].sort((a, b) => natural(a.CodProducto, b.CodProducto))
})

// ---------- Totales ----------
function totalProducto(cod) {
  let total = 0
  const prefijo = `${cod}::`
  for (const [k, v] of Object.entries(entradas.value)) {
    if (k.startsWith(prefijo)) total += Number(v) || 0
  }
  return redondear(total)
}

function formatPct(n) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatFecha(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// ---------- Guardar celda (con tope de 100%) ----------
async function guardarCelda(p, col, ev) {
  const el = ev.target
  const k = claveCelda(p.CodProducto, col.tipo, col.cod)
  const previo = entradas.value[k]
  error.value = ''

  let num = el.value === '' ? 0 : Number(el.value)
  if (isNaN(num) || num < 0) num = 0

  const otros = totalProducto(p.CodProducto) - (Number(previo) || 0)
  const disponible = redondear(100 - otros)
  if (num > disponible) {
    num = Math.max(disponible, 0)
    error.value = `${p.CodProducto}: el total no puede superar el 100%. Se ajustó a ${formatPct(num)}%.`
  }
  num = redondear(num)

  const nuevas = { ...entradas.value }
  const url = `${API}/productos-terminados/${encodeURIComponent(p.CodProducto)}/${col.tipo}/${encodeURIComponent(col.cod)}`

  try {
    if (num === 0) {
      delete nuevas[k]
      el.value = ''
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } else {
      nuevas[k] = num
      el.value = num
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Porcentaje: num })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al guardar')
      }
    }
    entradas.value = nuevas
    p.FechaModificacion = new Date().toISOString()
  } catch (err) {
    console.error(err)
    error.value = err.message && err.message !== '' ? err.message : 'No se pudo guardar el porcentaje.'
    el.value = previo ?? '' // vuelve al valor anterior
  }
}

// ---------- Crear producto ----------
const nuevoCod = ref('')
const nuevoNombre = ref('')
const inputNombre = ref(null)

function mayusculas(event) {
  const el = event.target
  const { selectionStart: ini, selectionEnd: fin } = el
  el.value = el.value.toUpperCase()
  el.setSelectionRange(ini, fin)
  return el.value
}

async function crearProducto() {
  const cod = nuevoCod.value.trim()
  const nombre = nuevoNombre.value.trim().toUpperCase()
  if (!cod || !nombre) return
  try {
    const res = await fetch(`${API}/productos-terminados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CodProducto: cod, Nombre: nombre })
    })
    if (!res.ok) throw new Error()
    productos.value.push(await res.json())
    nuevoCod.value = ''
    nuevoNombre.value = ''
    error.value = ''
  } catch (err) {
    console.error(err)
    error.value = 'No se pudo crear el producto (¿el código ya existe?)'
  }
}

// ---------- Editar / eliminar ----------
const editando = ref(null)
const nombreEdicion = ref('')

function empezarEdicion(p) {
  editando.value = p.CodProducto
  nombreEdicion.value = p.Nombre
}
function cancelarEdicion() {
  editando.value = null
  nombreEdicion.value = ''
}

async function guardarEdicion(p) {
  const nombre = nombreEdicion.value.trim().toUpperCase()
  if (!nombre) return
  try {
    const res = await fetch(`${API}/productos-terminados/${encodeURIComponent(p.CodProducto)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Nombre: nombre })
    })
    if (!res.ok) throw new Error()
    p.Nombre = nombre
    p.FechaModificacion = new Date().toISOString()
    editando.value = null
  } catch (err) {
    console.error(err)
    error.value = `No se pudo actualizar el producto ${p.CodProducto}.`
  }
}

async function eliminarProducto(p) {
  if (!confirm(`¿Eliminar el producto ${p.CodProducto} — ${p.Nombre}? Esto borra también su composición.`)) return
  try {
    const res = await fetch(`${API}/productos-terminados/${encodeURIComponent(p.CodProducto)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error()
    productos.value = productos.value.filter(x => x.CodProducto !== p.CodProducto)
    const nuevas = { ...entradas.value }
    for (const k of Object.keys(nuevas)) {
      if (k.startsWith(`${p.CodProducto}::`)) delete nuevas[k]
    }
    entradas.value = nuevas
  } catch (err) {
    console.error(err)
    error.value = `No se pudo eliminar el producto ${p.CodProducto}.`
  }
}

// ---------- Historial ----------
const historialAbierto = ref(null)
const historialData = ref([])
const cargandoHistorial = ref(false)

async function abrirHistorial(p) {
  historialAbierto.value = p.CodProducto
  cargandoHistorial.value = true
  try {
    const res = await fetch(`${API}/productos-terminados/${encodeURIComponent(p.CodProducto)}/historial`)
    historialData.value = res.ok ? await res.json() : []
  } catch (err) {
    console.error(err)
    historialData.value = []
  } finally {
    cargandoHistorial.value = false
  }
}
function cerrarHistorial() {
  historialAbierto.value = null
  historialData.value = []
}
function totalVersion(detalle) {
  return redondear(detalle.reduce((s, d) => s + Number(d.Porcentaje), 0))
}

// ---------- Exportar a Excel (respeta filtros de filas y columnas) ----------
function exportarExcel() {
  const cols = columnas.value   // columnas visibles (búsqueda + filtro de tipo)
  const rows = filas.value      // productos visibles (búsqueda)
  if (!cols.length || !rows.length) return

  const pctDeCelda = (codProducto, col) => {
    const v = entradas.value[claveCelda(codProducto, col.tipo, col.cod)]
    return v === undefined || v === null ? '' : redondear(Number(v))
  }

  const ROJO_FUERTE = 'DA9694'
  const ROJO_SUAVE  = 'F2DCDB'
  const linea = { style: 'thin', color: { rgb: '000000' } }
  const bordeCompleto = { top: linea, bottom: linea, left: linea, right: linea }

  const aoa = [
    ['', 'Tipo',   ...cols.map(c => c.tipo === 'formula' ? 'Fórmula' : 'Insumo'), ''],
    ['', 'Código', ...cols.map(c => c.cod), ''],
    ['', 'Nombre', ...cols.map(c => c.nombre), ''],
    ['Cód. producto', 'Producto terminado', ...cols.map(() => '%'), 'Total (%)'],
    ...rows.map(p => [
      p.CodProducto,
      p.Nombre,
      ...cols.map(c => pctDeCelda(p.CodProducto, c)),
      totalProducto(p.CodProducto)
    ])
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  const totalFilas = aoa.length
  const totalCols = 2 + cols.length + 1
  const ultimaCol = totalCols - 1

  const estilo = (r, c, s) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { t: 's', v: '' }
    ws[ref].s = { font: { name: 'Calibri', sz: 12 }, ...s }
  }
  const relleno = rgb => ({ fgColor: { rgb } })

  for (let r = 0; r < totalFilas; r++) {
    for (let c = 0; c < totalCols; c++) {
      // Cabecera (filas 0 a 2): un solo bloque, sin líneas horizontales internas
      if (r <= 2 && c >= 1) {
        estilo(r, c, {
          fill: relleno(ROJO_FUERTE),
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            left: linea, right: linea,
            top: r === 0 ? linea : undefined,
            bottom: r === 2 ? linea : undefined
          }
        })
      }
      // Fila de títulos de columnas
      else if (r === 3) {
        estilo(r, c, { fill: relleno(ROJO_SUAVE), border: bordeCompleto })
      }
      // Cuerpo: códigos y columna de total con fondo suave
      else if (r > 3) {
        estilo(r, c, {
          fill: c === 0 || c === ultimaCol ? relleno(ROJO_SUAVE) : undefined,
          border: bordeCompleto
        })
      }
    }
  }

  ws['!cols'] = [{ wch: 16 }, { wch: 38 }, ...cols.map(() => ({ wch: 18 })), { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Composición')

  const ahora = new Date()
  const hoy = ahora.toISOString().slice(0, 10)
  const hora = ahora.toTimeString().slice(0, 5).replace(':', '-')
  XLSX.writeFile(wb, `composicion_productos_${hoy}_${hora}.xlsx`)
}
</script>

<template>
  <div class="composicion-app">
    <header class="app-header">
      <p class="eyebrow">Producción</p>
      <h1 class="titulo-principal">Composición de Productos</h1>
    </header>

    <div class="envoltorio">
      <div class="card filtros-card">
        <h3 class="subtitulo">CREAR PRODUCTO TERMINADO</h3>
        <div class="filtros-fila">
          <div class="field">
            <label>Código</label>
            <input type="text" v-model="nuevoCod" placeholder="Ej: PT-01" @keyup.enter="inputNombre?.focus()">
          </div>
          <div class="field">
            <label>Nombre</label>
            <input
              type="text"
              ref="inputNombre"
              :value="nuevoNombre"
              @input="nuevoNombre = mayusculas($event)"
              placeholder="Ej: PRODUCTO FINAL A"
              @keyup.enter="crearProducto"
            >
          </div>
          <button class="btn btn-outline" type="button" @click="crearProducto">Crear</button>
        </div>
      </div>

      <div class="card filtros-card">
        <div class="filtros-fila">
          <div class="field">
            <label for="buscar-producto">Buscar producto terminado (filas)</label>
            <input id="buscar-producto" type="text" v-model="busquedaProducto" placeholder="Código o nombre">
          </div>
          <div class="field">
            <label for="buscar-columna">Buscar fórmula / insumo (columnas)</label>
            <input id="buscar-columna" type="text" v-model="busquedaColumna" placeholder="Código o nombre">
          </div>
          <div class="field">
            <label for="filtro-tipo">Mostrar</label>
            <select id="filtro-tipo" v-model="filtroTipo" class="select-tipo">
              <option value="todos">Fórmulas e insumos</option>
              <option value="formula">Solo fórmulas</option>
              <option value="insumo">Solo insumos</option>
            </select>
          </div>
          <button class="btn btn-outline" type="button" @click="cargarTodo" :disabled="cargando">
            {{ cargando ? 'Actualizando…' : 'Actualizar' }}
          </button>
          <button
            class="btn btn-outline"
            type="button"
            @click="exportarExcel"
            :disabled="cargando || !columnas.length || !filas.length"
          >
            <i class="bi bi-file-earmark-excel-fill"></i> Exportar a Excel
          </button>
        </div>
        <p v-if="error" class="aviso aviso-error">{{ error }}</p>
      </div>

      <p v-if="cargando" class="placeholder">Cargando…</p>
      <p v-else-if="productos.length === 0" class="placeholder">Todavía no creaste ningún producto terminado.</p>
      <p v-else-if="filas.length === 0" class="placeholder">Ningún producto coincide con la búsqueda.</p>
      <p v-else-if="columnas.length === 0" class="placeholder">Ninguna fórmula o insumo coincide con la búsqueda.</p>

      <div v-else class="tabla-scroll">
        <table class="matriz">
          <thead>
            <tr>
              <th class="esquina">Producto terminado</th>
              <th
                v-for="c in columnas"
                :key="c.tipo + c.cod"
                class="col-comp"
                :class="c.tipo"
              >
                <span class="tag">{{ c.tipo === 'formula' ? 'Fórmula' : 'Insumo' }}</span>
                <span class="col-codigo">{{ c.cod }}</span>
                <span class="col-detalle">{{ c.nombre }}</span>
              </th>
              <th class="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filas" :key="p.CodProducto">
              <th class="fila-producto">
                <template v-if="editando === p.CodProducto">
                  <span class="fila-codigo">{{ p.CodProducto }}</span>
                  <input
                    type="text"
                    class="input-edicion"
                    :value="nombreEdicion"
                    @input="nombreEdicion = mayusculas($event)"
                    @keyup.enter="guardarEdicion(p)"
                    @keyup.esc="cancelarEdicion"
                  >
                  <div class="acciones">
                    <button type="button" class="btn-icono" title="Guardar" @click="guardarEdicion(p)">✓</button>
                    <button type="button" class="btn-icono" title="Cancelar" @click="cancelarEdicion">✕</button>
                  </div>
                </template>
                <template v-else>
                  <div class="fila-textos">
                    <span class="fila-codigo">{{ p.CodProducto }}</span>
                    <span class="fila-detalle">{{ p.Nombre }}</span>
                    <span class="fila-fecha">{{ formatFecha(p.FechaModificacion) }}</span>
                  </div>
                  <div class="acciones">
                    <button type="button" class="btn-icono" title="Historial" @click="abrirHistorial(p)"><i class="bi bi-clock-history"></i></button>
                    <button type="button" class="btn-icono" title="Editar" @click="empezarEdicion(p)"><i class="bi bi-pencil-fill"></i></button>
                    <button type="button" class="btn-icono btn-icono-borrar" title="Eliminar" @click="eliminarProducto(p)"><i class="bi bi-trash3-fill"></i></button>
                  </div>
                </template>
              </th>

              <td v-for="c in columnas" :key="c.tipo + c.cod" class="celda-td">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  class="celda"
                  :value="entradas[claveCelda(p.CodProducto, c.tipo, c.cod)] ?? ''"
                  @change="guardarCelda(p, c, $event)"
                >
              </td>

              <td class="celda-total" :class="{ completo: totalProducto(p.CodProducto) === 100, vacio: totalProducto(p.CodProducto) === 0 }">
                {{ formatPct(totalProducto(p.CodProducto)) }} %
                <span v-if="totalProducto(p.CodProducto) < 100" class="falta">
                  falta {{ formatPct(100 - totalProducto(p.CodProducto)) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="historialAbierto" class="modal-overlay" @click.self="cerrarHistorial">
        <div class="modal-historial">
          <div class="modal-header">
            <h3>Historial — {{ historialAbierto }}</h3>
            <button type="button" class="btn-icono" @click="cerrarHistorial">✕</button>
          </div>
          <p v-if="cargandoHistorial" class="placeholder">Cargando…</p>
          <p v-else-if="historialData.length === 0" class="placeholder">Todavía no hay versiones anteriores guardadas.</p>
          <div v-else class="historial-lista">
            <div v-for="v in historialData" :key="v.HistorialId" class="version-card">
              <div class="version-header">
                <strong>{{ v.Nombre }}</strong>
                <span class="version-fecha">{{ formatFecha(v.FechaVersion) }}</span>
              </div>
              <p v-if="v.Detalle.length === 0" class="version-vacia">Sin componentes en esta versión.</p>
              <table v-else class="version-tabla">
                <thead><tr><th>Componente</th><th>%</th></tr></thead>
                <tbody>
                  <tr v-for="d in v.Detalle" :key="d.Tipo + d.CodComponente">
                    <td>
                      <span class="mini-tag" :class="d.Tipo">{{ d.Tipo === 'formula' ? 'Fórmula' : 'Insumo' }}</span>
                      {{ d.CodComponente }} — {{ nombreComponente(d.Tipo, d.CodComponente) }}
                    </td>
                    <td>{{ formatPct(d.Porcentaje) }} %</td>
                  </tr>
                  <tr class="fila-suma">
                    <td>Total</td>
                    <td>{{ formatPct(totalVersion(v.Detalle)) }} %</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.composicion-app {
  --ink: #221f1e;
  --ink-soft: #6e6360;
  --surface: #ffffff;
  --bg: #f2efee;
  --line: #ddd6d4;
  --accent: #c1272d;
  --accent-dark: #8c1b1f;
  --accent-soft: #f7e6e5;
  --header-bg: #f0f0f0;
  --ok: #1f7a3d;
  --ok-soft: #e3f4e8;
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

.composicion-app * { box-sizing: border-box; }

.app-header { text-align: center; padding: 3rem 1.5rem 1.75rem; }

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

.envoltorio {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.filtros-card { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.subtitulo { font-family: var(--font-display); font-weight: bold; margin: 0; }
.filtros-fila { display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }

.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
}

input, .select-tipo {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input:focus, .select-tipo:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
#buscar-producto, #buscar-columna { width: 260px; }

.btn {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  border: 1.5px solid transparent;
  cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-outline { background: var(--surface); border-color: var(--ink-soft); color: var(--ink); }
.btn-outline:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-dark); }

.aviso {
  border-radius: 8px;
  padding: 0.5rem 0.8rem;
  font-size: 0.85rem;
  background: var(--accent-soft);
  color: var(--accent-dark);
  border: 1px solid var(--accent);
  margin: 0;
}

.placeholder { 
  color: var(--ink-soft); 
  font-style: italic; 
  text-align: center; 
  padding: 2rem 0; }

/* Matriz */
.tabla-scroll {
  max-height: 100vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  background: var(--surface);
}
.matriz { 
  border-collapse: separate; 
  border-spacing: 0; 
  font-size: 0.78rem; }

.matriz th, 
.matriz td { 
  border-right: 1px solid var(--line); 
  border-bottom: 1px solid var(--line); 
  padding: 0; }

.esquina {
  position: sticky; top: 0; left: 0; z-index: 3;
  background: var(--header-bg);
  min-width: 260px;
  padding: 0.5rem 0.6rem !important;
  text-align: left;
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 1rem;
  color: var(--ink-soft);
}

.col-comp {
  position: sticky; 
  top: 0; 
  z-index: 1;
  background: var(--header-bg);
  min-width: 120px; 
  max-width: 130px;
  padding: 0.4rem 0.3rem !important;
  text-align: center;
  vertical-align: bottom;
  border-top: 4px solid var(--accent);
}
.col-comp.insumo { 
  border-top-color: var(--ink-soft); 
}

.tag {
  display: block;
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
}
.col-codigo { display: block; font-size: 1rem; color: var(--ink-soft); line-height: 1.15; }
.col-detalle {
  display: block;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-dark);
  font-size: 0.8rem;
  white-space: normal;
  word-break: break-word;
}

.col-total {
  position: sticky; top: 0; right: 0; z-index: 3;
  background: var(--header-bg);
  min-width: 100px;
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 1rem;
  color: var(--ink-soft);
}

.fila-producto {
  position: sticky; left: 0; z-index: 1;
  background: var(--surface);
  min-width: 260px;
  padding: 0.4rem 0.6rem !important;
  text-align: left;
  font-weight: normal;
}
.fila-producto > * { vertical-align: middle; }
.fila-textos { display: block; }
.fila-codigo {
  display: inline-block;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-dark);
  margin-right: 0.4rem;
  font-size: 0.9rem;
}

.fila-detalle { 
  font-size: 1rem; 
  color: var(--ink); }

.fila-fecha { 
  display: block; 
  font-size: 0.80rem; 
  color: var(--ink-soft); }

.acciones { 
  display: flex; 
  gap: 0.2rem; 
  margin-top: 0.2rem; }

.input-edicion { 
  font-size: 0.8rem; 
  padding: 0.2rem 0.4rem; 
  width: 90%; }

.celda-td { padding: 0.2rem !important; }
.celda {
  width: 100%;
  min-width: 90px;
  text-align: center;
  padding: 0.4rem 0.2rem;
  border: none;
  border-radius: 0;
  background: transparent;
}
.celda:focus { box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-soft); }

.celda-total {
  position: sticky; right: 0; z-index: 1;
  background: var(--header-bg);
  text-align: center;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-dark);
  padding: 0.4rem !important;
  white-space: nowrap;
}
.celda-total.completo { background: var(--ok-soft); color: var(--ok); }
.celda-total.vacio { color: var(--ink-soft); }
.falta { display: block; font-size: 0.65rem; font-weight: 500; color: var(--ink-soft); }

tbody tr:nth-child(even) .fila-producto { background: var(--bg); }
tbody tr:nth-child(even) td.celda-td { background: #fbfafa; }

.btn-icono {
  border: none; 
  background: transparent; 
  cursor: pointer;
  font-size: 0.8rem; 
  line-height: 2;
  padding: 0.1rem 0.25rem; 
  border-radius: 4px; 
  color: var(--ink);
}

.btn-icono:hover { 
  background: var(--accent-soft); 
  color: var(--accent-dark); }

.btn-icono-borrar:hover { background: #f6d9d9; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(34, 31, 30, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 10;
}
.modal-historial {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  width: min(640px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
}
.modal-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 1rem; 
}

.modal-header h3 { 
  font-family: var(--font-display); 
  text-transform: uppercase; 
  margin: 0; 
}

.version-card { 
  border: 1px solid var(--line); 
  border-radius: 8px; 
  padding: 0.75rem 1rem; 
  margin-bottom: 0.75rem; 
}

.version-header { 
  display: flex; 
  justify-content: space-between; 
  margin-bottom: 0.5rem; 
  font-size: 0.9rem; 
}

.version-fecha { 
  color: var(--ink-soft); 
  font-size: 0.78rem; 
}

.version-vacia { 
  color: var(--ink-soft); 
  font-style: italic; 
  font-size: 0.8rem; 
  margin: 0; 
}

.version-tabla { 
  width: 100%; 
  border-collapse: collapse; 
  font-size: 0.8rem; 
}

.version-tabla th, 
.version-tabla td { 
  text-align: left; 
  padding: 0.2rem 0.4rem; 
  border-bottom: 1px solid var(--line); 
}

.fila-suma td { 
  font-weight: 700; 
}

.mini-tag {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-dark);
  margin-right: 0.3rem;
}

.mini-tag.insumo { 
  background: var(--bg); 
  color: var(--ink-soft); }

@media (max-width: 640px) {
  .filtros-fila { flex-direction: column; align-items: stretch; }
  #buscar-producto, #buscar-columna { width: 100%; }
}
</style>
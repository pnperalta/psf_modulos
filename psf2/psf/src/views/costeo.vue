<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const API = 'http://localhost:3000'

const insumos = ref([])
const formulas = ref([])
const detalleFormulas = ref([])   // { CodFormula, CodArticulo, Cantidad (kg) }
const productos = ref([])
const detalleProductos = ref([])  // { CodProducto, Tipo, CodComponente, Porcentaje }
const precioDolar = ref(0)

const cargando = ref(false)
const error = ref('')
const solapa = ref('formulas')    // formulas | productos
const moneda = ref('pesos')       // pesos | dolares
const busqueda = ref('')
const abiertos = ref({})          // filas expandidas

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })
const redondear = n => Math.round(n * 100) / 100

async function cargarTodo() {
  cargando.value = true
  error.value = ''
  try {
    const [rI, rF, rFD, rP, rPD, rD] = await Promise.all([
      fetch(`${API}/modulouno`),
      fetch(`${API}/formulas`),
      fetch(`${API}/formulas/detalle`),
      fetch(`${API}/productos-terminados`),
      fetch(`${API}/productos-terminados/detalle`),
      fetch(`${API}/dolar`)
    ])
    if (!rI.ok) throw new Error('insumos')
    insumos.value = await rI.json()
    formulas.value = rF.ok ? await rF.json() : []
    detalleFormulas.value = rFD.ok ? await rFD.json() : []
    productos.value = rP.ok ? await rP.json() : []
    detalleProductos.value = rPD.ok ? await rPD.json() : []
    if (rD.ok) precioDolar.value = Number((await rD.json()).precioDolar) || 0
  } catch (err) {
    console.error(err)
    error.value = 'No se pudieron cargar los datos.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargarTodo)

// ---------- Costo fijo único (en pesos), igual para todos los productos ----------
const costoFijo = ref(0)
try {
  costoFijo.value = Number(localStorage.getItem('costeo_costo_fijo')) || 0
} catch { costoFijo.value = 0 }

watch(costoFijo, v => {
  try { localStorage.setItem('costeo_costo_fijo', String(v || 0)) } catch {}
})

function onCostoFijo(valor) {
  const n = parseFloat(valor)
  costoFijo.value = isNaN(n) || n < 0 ? 0 : n
}

// ---------- Helpers de moneda ----------
const simbolo = computed(() => moneda.value === 'pesos' ? '$' : 'US$')
function fmt(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtKg(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}
function pesosAMoneda(pesos) {
  if (moneda.value === 'pesos') return Number(pesos) || 0
  return precioDolar.value ? (Number(pesos) || 0) / precioDolar.value : 0
}

// ---------- Insumos: precio por kg en la moneda elegida ----------
const mapaInsumos = computed(() => {
  const m = {}
  for (const i of insumos.value) {
    const k = String(i.CodArticulo)
    if (m[k]) continue
    const precio = moneda.value === 'pesos' ? Number(i.Pesos) : Number(i.Dolares)
    m[k] = { nombre: i.DetalleArticulo, precioKg: precio || 0 }
  }
  return m
})

// ---------- Costeo de fórmulas ----------
const costoFormulas = computed(() => {
  const porFormula = {}
  for (const d of detalleFormulas.value) {
    const k = String(d.CodFormula)
    ;(porFormula[k] ||= []).push(d)
  }
  const res = {}
  for (const f of formulas.value) {
    const k = String(f.CodFormula)
    const lineas = (porFormula[k] || []).map(d => {
      const ins = mapaInsumos.value[String(d.CodArticulo)]
      const kg = Number(d.Cantidad) || 0
      const precioKg = ins ? ins.precioKg : 0
      return {
        cod: d.CodArticulo,
        nombre: ins ? ins.nombre : '(ya no existe)',
        kg,
        precioKg,
        subtotal: kg * precioKg,
        sinPrecio: !precioKg
      }
    })
    const costoLote = lineas.reduce((s, l) => s + l.subtotal, 0)
    const rendimiento = lineas.reduce((s, l) => s + l.kg, 0)
    res[k] = {
      lineas,
      costoLote,
      rendimiento,
      costoKg: rendimiento > 0 ? costoLote / rendimiento : 0,
      incompleta: lineas.some(l => l.sinPrecio)
    }
  }
  return res
})

const formulasFiltradas = computed(() => {
  const t = busqueda.value.trim().toLowerCase()
  const lista = t
    ? formulas.value.filter(f =>
        String(f.CodFormula).toLowerCase().includes(t) ||
        String(f.Nombre ?? '').toLowerCase().includes(t))
    : formulas.value
  return [...lista].sort((a, b) => Number(a.CodFormula) - Number(b.CodFormula))
})

// ---------- Costeo de productos terminados ----------
const costoProductos = computed(() => {
  const porProducto = {}
  for (const d of detalleProductos.value) {
    const k = String(d.CodProducto)
    ;(porProducto[k] ||= []).push(d)
  }
  const res = {}
  for (const p of productos.value) {
    const k = String(p.CodProducto)
    const lineas = (porProducto[k] || []).map(d => {
      const pct = Number(d.Porcentaje) || 0
      let nombre, costoKg, sinPrecio
      if (d.Tipo === 'formula') {
        const f = formulas.value.find(x => String(x.CodFormula) === String(d.CodComponente))
        const c = costoFormulas.value[String(d.CodComponente)]
        nombre = f ? f.Nombre : '(ya no existe)'
        costoKg = c ? c.costoKg : 0
        sinPrecio = !c || !c.costoKg
      } else {
        const ins = mapaInsumos.value[String(d.CodComponente)]
        nombre = ins ? ins.nombre : '(ya no existe)'
        costoKg = ins ? ins.precioKg : 0
        sinPrecio = !costoKg
      }
      return {
        tipo: d.Tipo, cod: d.CodComponente, nombre, pct, costoKg,
        aporte: (pct / 100) * costoKg, sinPrecio
      }
    })
    lineas.sort((a, b) => b.pct - a.pct)
    const subtotal = lineas.reduce((s, l) => s + l.aporte, 0)
    const fijo = pesosAMoneda(costoFijo.value)
    res[k] = {
      lineas,
      subtotal,
      fijo,
      total: subtotal + fijo,
      pctTotal: redondear(lineas.reduce((s, l) => s + l.pct, 0)),
      incompleta: lineas.some(l => l.sinPrecio)
    }
  }
  return res
})

const productosFiltrados = computed(() => {
  const t = busqueda.value.trim().toLowerCase()
  const lista = t
    ? productos.value.filter(p =>
        String(p.CodProducto).toLowerCase().includes(t) ||
        String(p.Nombre ?? '').toLowerCase().includes(t))
    : productos.value
  return [...lista].sort((a, b) => natural(a.CodProducto, b.CodProducto))
})

function toggleFila(clave) {
  abiertos.value = { ...abiertos.value, [clave]: !abiertos.value[clave] }
}
function cambiarSolapa(s) {
  solapa.value = s
  busqueda.value = ''
}
</script>

<template>
  <div class="costeo-app">
    <header class="app-header">
      <p class="eyebrow">Producción</p>
      <h1 class="titulo-principal">Costeo</h1>
    </header>

    <div class="envoltorio">
      <div class="card filtros-card">
        <div class="filtros-fila">
          <div class="solapas">
            <button type="button" class="solapa" :class="{ activa: solapa === 'formulas' }" @click="cambiarSolapa('formulas')">Fórmulas</button>
            <button type="button" class="solapa" :class="{ activa: solapa === 'productos' }" @click="cambiarSolapa('productos')">Productos terminados</button>
          </div>

          <div class="field">
            <label for="buscar">{{ solapa === 'formulas' ? 'Buscar fórmula' : 'Buscar producto' }}</label>
            <input id="buscar" type="text" v-model="busqueda" placeholder="Código o nombre">
          </div>

          <div class="field">
            <label for="moneda">Moneda</label>
            <select id="moneda" v-model="moneda" class="select-tipo">
              <option value="pesos">Pesos ($)</option>
              <option value="dolares" :disabled="!precioDolar">Dólares (US$)</option>
            </select>
          </div>

          <div class="field" v-if="solapa === 'productos'">
            <label for="costo-fijo">Costo fijo por kg (en pesos)</label>
            <input
                id="costo-fijo"
                type="number" step="0.01" min="0"
                class="input-fijo-global"
                :value="costoFijo || ''"
                placeholder="0.00"
                @change="onCostoFijo($event.target.value)"
            >
        </div>
          <button class="btn btn-outline" type="button" @click="cargarTodo" :disabled="cargando">
            {{ cargando ? 'Actualizando…' : 'Actualizar' }}
          </button>
        </div>
        <p v-if="precioDolar" class="nota">Cotización del dólar: ${{ fmt(precioDolar) }}</p>
        <p v-if="error" class="aviso">{{ error }}</p>
      </div>

      <p v-if="cargando" class="placeholder">Cargando…</p>

      <!-- ===================== FÓRMULAS ===================== -->
      <template v-else-if="solapa === 'formulas'">
        <p v-if="formulasFiltradas.length === 0" class="placeholder">No hay fórmulas para mostrar.</p>
        <div v-else class="card table-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th></th>
                <th>Cód.</th>
                <th>Fórmula</th>
                <th class="num">Costo de la bachada</th>
                <th class="num">Rinde (kg)</th>
                <th class="num">Costo por kg</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="f in formulasFiltradas" :key="f.CodFormula">
                <tr class="fila-click" @click="toggleFila('f' + f.CodFormula)">
                  <td class="chevron">{{ abiertos['f' + f.CodFormula] ? '▾' : '▸' }}</td>
                  <td><span class="code-chip">{{ f.CodFormula }}</span></td>
                  <td>
                    {{ f.Nombre }}
                    <span v-if="costoFormulas[String(f.CodFormula)]?.incompleta" class="warn" title="Hay insumos sin precio cargado">⚠ faltan precios</span>
                  </td>
                  <td class="num">{{ simbolo }} {{ fmt(costoFormulas[String(f.CodFormula)]?.costoLote) }}</td>
                  <td class="num">{{ fmtKg(costoFormulas[String(f.CodFormula)]?.rendimiento) }}</td>
                  <td class="num destacado">{{ simbolo }} {{ fmt(costoFormulas[String(f.CodFormula)]?.costoKg) }}</td>
                </tr>
                <tr v-if="abiertos['f' + f.CodFormula]" class="fila-detalle-tr">
                  <td></td>
                  <td colspan="5">
                    <p v-if="!costoFormulas[String(f.CodFormula)]?.lineas.length" class="vacio">Esta fórmula no tiene insumos cargados.</p>
                    <table v-else class="subtabla">
                      <thead>
                        <tr>
                          <th>Insumo</th>
                          <th class="num">Cantidad (kg)</th>
                          <th class="num">Precio por kg</th>
                          <th class="num">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="l in costoFormulas[String(f.CodFormula)].lineas" :key="l.cod">
                          <td><span class="code-chip chico">{{ l.cod }}</span> {{ l.nombre }}
                            <span v-if="l.sinPrecio" class="warn">⚠ sin precio</span></td>
                          <td class="num">{{ fmtKg(l.kg) }}</td>
                          <td class="num">{{ simbolo }} {{ fmt(l.precioKg) }}</td>
                          <td class="num">{{ simbolo }} {{ fmt(l.subtotal) }}</td>
                        </tr>
                        <tr class="fila-suma">
                          <td>Total bachada</td>
                          <td class="num">{{ fmtKg(costoFormulas[String(f.CodFormula)].rendimiento) }}</td>
                          <td></td>
                          <td class="num">{{ simbolo }} {{ fmt(costoFormulas[String(f.CodFormula)].costoLote) }}</td>
                        </tr>
                        <tr class="fila-suma">
                          <td colspan="3">Costo por kg ({{ fmt(costoFormulas[String(f.CodFormula)].costoLote) }} ÷ {{ fmtKg(costoFormulas[String(f.CodFormula)].rendimiento) }})</td>
                          <td class="num">{{ simbolo }} {{ fmt(costoFormulas[String(f.CodFormula)].costoKg) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>

      <!-- ===================== PRODUCTOS TERMINADOS ===================== -->
      <template v-else>
        <p v-if="productosFiltrados.length === 0" class="placeholder">No hay productos terminados para mostrar.</p>
        <div v-else class="card table-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th></th>
                <th>Cód.</th>
                <th>Producto terminado</th>
                <th class="num">Composición</th>
                <th class="num">Costo de componentes</th>
                <th class="num">Costo final por kg</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="p in productosFiltrados" :key="p.CodProducto">
                <tr class="fila-click" @click="toggleFila('p' + p.CodProducto)">
                  <td class="chevron">{{ abiertos['p' + p.CodProducto] ? '▾' : '▸' }}</td>
                  <td><span class="code-chip">{{ p.CodProducto }}</span></td>
                  <td>
                    {{ p.Nombre }}
                    <span v-if="costoProductos[String(p.CodProducto)]?.incompleta" class="warn">⚠ faltan precios</span>
                  </td>
                  <td class="num" :class="{ ok: costoProductos[String(p.CodProducto)]?.pctTotal === 100 }">
                    {{ fmt(costoProductos[String(p.CodProducto)]?.pctTotal) }} %
                  </td>
                  <td class="num">{{ simbolo }} {{ fmt(costoProductos[String(p.CodProducto)]?.subtotal) }}</td>
                  <td class="num destacado">{{ simbolo }} {{ fmt(costoProductos[String(p.CodProducto)]?.total) }}</td>
                </tr>
                <tr v-if="abiertos['p' + p.CodProducto]" class="fila-detalle-tr">
                  <td></td>
                  <td colspan="5">
                    <p v-if="!costoProductos[String(p.CodProducto)]?.lineas.length" class="vacio">Este producto no tiene composición cargada.</p>
                    <table v-else class="subtabla">
                      <thead>
                        <tr>
                          <th>Componente</th>
                          <th class="num">%</th>
                          <th class="num">Costo por kg</th>
                          <th class="num">Aporte</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="l in costoProductos[String(p.CodProducto)].lineas" :key="l.tipo + l.cod">
                          <td>
                            <span class="mini-tag" :class="l.tipo">{{ l.tipo === 'formula' ? 'Fórmula' : 'Insumo' }}</span>
                            {{ l.cod }} — {{ l.nombre }}
                            <span v-if="l.sinPrecio" class="warn">⚠ sin precio</span>
                          </td>
                          <td class="num">{{ fmt(l.pct) }} %</td>
                          <td class="num">{{ simbolo }} {{ fmt(l.costoKg) }}</td>
                          <td class="num">{{ simbolo }} {{ fmt(l.aporte) }}</td>
                        </tr>
                        <tr class="fila-suma">
                          <td colspan="3">Subtotal componentes</td>
                          <td class="num">{{ simbolo }} {{ fmt(costoProductos[String(p.CodProducto)].subtotal) }}</td>
                        </tr>
                        <tr>
                          <td colspan="3">+ Costo fijo de fábrica</td>
                          <td class="num">{{ simbolo }} {{ fmt(costoProductos[String(p.CodProducto)].fijo) }}</td>
                        </tr>
                        <tr class="fila-suma">
                          <td colspan="3">Costo final por kg</td>
                          <td class="num">{{ simbolo }} {{ fmt(costoProductos[String(p.CodProducto)].total) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.costeo-app {
  --ink: #221f1e;
  --ink-soft: #6e6360;
  --surface: #ffffff;
  --bg: #f2efee;
  --line: #ddd6d4;
  --accent: #c1272d;
  --accent-dark: #8c1b1f;
  --accent-soft: #f7e6e5;
  --ok: #1f7a3d;
  --warn: #b26a00;
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
.costeo-app * { box-sizing: border-box; }

.app-header { text-align: center; padding: 3rem 1.5rem 1.75rem; }
.eyebrow {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.18em;
  font-size: 0.75rem; font-weight: 600; color: var(--accent-dark); margin: 0 0 0.4rem;
}
.titulo-principal {
  font-family: var(--font-display); font-weight: 700; font-size: clamp(2.1rem, 5vw, 3rem);
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink); margin: 0;
  padding-bottom: 0.7rem; position: relative; display: inline-block;
}
.titulo-principal::after {
  content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 4.5rem; height: 0.3rem; border-radius: 999px; background: var(--accent);
}

.envoltorio {
  max-width: 1400px; margin: 0 auto; padding: 0 1.5rem;
  display: flex; flex-direction: column; gap: 1.5rem;
}
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.filtros-card { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.filtros-fila { display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }

.solapas { display: flex; gap: 0.4rem; }
.solapa {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.04em;
  font-weight: 600; font-size: 0.85rem; padding: 0.6rem 1.2rem; border-radius: 8px;
  border: 1.5px solid var(--line); background: var(--surface); color: var(--ink-soft); cursor: pointer;
}
.solapa.activa { background: var(--accent); border-color: var(--accent); color: #fff; }

.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.05em;
  font-size: 0.78rem; font-weight: 600; color: var(--ink-soft);
}
input, .select-tipo {
  font-family: var(--font-body); font-size: 0.95rem; color: var(--ink); background: var(--surface);
  border: 1.5px solid var(--line); border-radius: 8px; padding: 0.55rem 0.7rem;
}
input:focus, .select-tipo:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);
}
#buscar { width: 260px; }

.btn {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.04em;
  font-weight: 600; font-size: 0.85rem; padding: 0.6rem 1.2rem; border-radius: 8px;
  border: 1.5px solid transparent; cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-outline { background: var(--surface); border-color: var(--ink-soft); color: var(--ink); }
.btn-outline:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-dark); }

.nota { margin: 0; font-size: 0.82rem; color: var(--ink-soft); }
.aviso {
  border-radius: 8px; padding: 0.5rem 0.8rem; font-size: 0.85rem; background: var(--accent-soft);
  color: var(--accent-dark); border: 1px solid var(--accent); margin: 0;
}
.placeholder { color: var(--ink-soft); font-style: italic; text-align: center; padding: 2rem 0; }

.table-wrap { overflow-x: auto; }
.tabla { width: 100%; border-collapse: collapse; min-width: 820px; }
.tabla > thead > tr > th {
  background: var(--ink); color: var(--surface); font-family: var(--font-display);
  text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; font-size: 0.8rem;
  text-align: left; padding: 0.9rem 1.1rem;
}
.tabla > tbody > tr > td { padding: 0.8rem 1.1rem; border-bottom: 1px solid var(--line); font-size: 0.92rem; }
.num { text-align: right !important; font-family: var(--font-mono); white-space: nowrap; }
.destacado { font-weight: 700; color: var(--accent-dark); }
.ok { color: var(--ok); font-weight: 700; }
.chevron { width: 1.5rem; color: var(--ink-soft); }
.fila-click { cursor: pointer; }
.fila-click:hover { background: var(--accent-soft); }
.fila-detalle-tr > td { background: var(--bg); }

.code-chip {
  font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent-dark);
  background: var(--accent-soft); padding: 0.3rem 0.55rem; border-radius: 6px;
}
.code-chip.chico { font-size: 0.72rem; padding: 0.15rem 0.4rem; }

.warn { font-size: 0.72rem; color: var(--warn); margin-left: 0.4rem; font-weight: 600; }
.vacio { color: var(--ink-soft); font-style: italic; margin: 0.5rem 0; }

.subtabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.4rem 0; }
.subtabla th {
  text-align: left; font-family: var(--font-display); text-transform: uppercase;
  font-size: 0.72rem; letter-spacing: 0.05em; color: var(--ink-soft);
  padding: 0.3rem 0.5rem; border-bottom: 1.5px solid var(--line);
}
.subtabla th.num { text-align: right; }
.subtabla td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--line); }
.fila-suma td { font-weight: 700; }

.input-fijo-global { width: 160px; font-family: var(--font-mono); }

.mini-tag {
  font-family: var(--font-display); text-transform: uppercase; font-size: 0.62rem;
  letter-spacing: 0.06em; padding: 0.05rem 0.35rem; border-radius: 4px;
  background: var(--accent-soft); color: var(--accent-dark); margin-right: 0.3rem;
}
.mini-tag.insumo { background: var(--surface); color: var(--ink-soft); border: 1px solid var(--line); }

@media (max-width: 640px) {
  .filtros-fila { flex-direction: column; align-items: stretch; }
  #buscar { width: 100%; }
}
</style>
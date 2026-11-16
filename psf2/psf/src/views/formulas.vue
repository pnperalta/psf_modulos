<script setup>
import { ref, computed, onMounted } from 'vue'
import XLSX from 'xlsx-js-style'

const insumosDisponibles = ref([]) // de /modulouno — esto alimenta las filas (insumos), NO cambia
const listaFormulas = ref([])      // de /formulas — { CodFormula, Nombre }, esto alimenta las columnas
const detalle = ref([])            // de /formulas/detalle — { CodFormula, CodArticulo, Cantidad }

const cargando = ref(false)
const error = ref('')
const exito = ref('')

// entradas[CodFormula::CodArticulo] = { valor, unidad }
const entradas = ref({})

function clave(codFormula, codArticulo) {
  return `${codFormula}::${codArticulo}`
}

// Crea (si falta) una entrada vacía para cada combinación fórmula x insumo.
// Se llama después de cargar datos, y cada vez que se crea una fórmula nueva
// o aparece un insumo nuevo — así nunca se muta nada durante el render.
function asegurarEntradas() {
  const nuevas = { ...entradas.value }
  for (const f of listaFormulas.value) {
    for (const i of insumosDisponibles.value) {
      const k = clave(f.CodFormula, i.CodArticulo)
      if (!nuevas[k]) nuevas[k] = { valor: '', unidad: 'kg' }
    }
  }
  entradas.value = nuevas
}

async function cargarTodo() {
  cargando.value = true
  error.value = ''
  try {
    const [resInsumos, resFormulas, resDetalle] = await Promise.all([
      fetch('http://localhost:3000/modulouno'),
      fetch('http://localhost:3000/formulas'),
      fetch('http://localhost:3000/formulas/detalle')
    ])
    if (!resInsumos.ok) throw new Error('Error al obtener los insumos')
    insumosDisponibles.value = await resInsumos.json()
    listaFormulas.value = resFormulas.ok ? await resFormulas.json() : []
    detalle.value = resDetalle.ok ? await resDetalle.json() : []

    const nuevasEntradas = {}
    for (const it of detalle.value) {
      const unidad = it.Unidad === 'gramos' ? 'gramos' : 'kg'
      const cantidadNum = Number(it.Cantidad)          // 👈 fuerza número, saca los ceros de más
      const valor = unidad === 'gramos' ? cantidadNum * 1000 : cantidadNum
      nuevasEntradas[clave(it.CodFormula, it.CodArticulo)] = { valor, unidad }
    }
    entradas.value = nuevasEntradas
    asegurarEntradas()
  } catch (err) {
    console.error(err)
    error.value = 'No se pudieron cargar los datos.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargarTodo)

// ---- Insumos: SIEMPRE todos los que existan en modulouno (izquierda) ----
const busquedaInsumo = ref('')

const filas = computed(() => {
  const vistos = new Set()
  const lista = []
  for (const p of insumosDisponibles.value) {
    if (!vistos.has(p.CodArticulo)) {
      vistos.add(p.CodArticulo)
      lista.push({ CodArticulo: p.CodArticulo, DetalleArticulo: p.DetalleArticulo })
    }
  }
  const termino = busquedaInsumo.value.trim().toLowerCase()
  const filtradas = termino
    ? lista.filter(i =>
        String(i.CodArticulo ?? '').toLowerCase().includes(termino) ||
        String(i.DetalleArticulo ?? '').toLowerCase().includes(termino)
      )
    : lista
  // Orden natural descendente: 19879 > 2004 > 2001 > 115 > 114 ...
// Orden natural ascendente: 109 < 110 < ... < 115 < 2001 < ... < 19879
return filtradas.sort((a, b) =>
  String(a.CodArticulo).localeCompare(String(b.CodArticulo), undefined, { numeric: true })
)
})

// ---- Fórmulas: columnas, creadas por el usuario ----
const formulasSeleccionadas = ref([]) // [] = mostrar todas

const columnas = computed(() => {
  const base = formulasSeleccionadas.value.length === 0
    ? listaFormulas.value
    : listaFormulas.value.filter(f => formulasSeleccionadas.value.includes(f.CodFormula))
  return [...base].sort((a, b) => Number(a.CodFormula) - Number(b.CodFormula))
})

const formulasOrdenadas = computed(() =>
  [...listaFormulas.value].sort((a, b) => Number(a.CodFormula) - Number(b.CodFormula))
)

function toggleFormula(cod) {
  const idx = formulasSeleccionadas.value.indexOf(cod)
  if (idx === -1) formulasSeleccionadas.value.push(cod)
  else formulasSeleccionadas.value.splice(idx, 1)
}

function limpiarFormulas() {
  formulasSeleccionadas.value = []
}

// Pasa el texto del input a mayúsculas sin mover el cursor y devuelve el valor
function mayusculas(event) {
  const el = event.target
  const { selectionStart: ini, selectionEnd: fin } = el
  el.value = el.value.toUpperCase()
  el.setSelectionRange(ini, fin)
  return el.value
}

// ---- Crear fórmula nueva ----
const nuevoCodFormula = ref('')
const nuevoNombreFormula = ref('')
const inputNombreFormula = ref(null)

function irANombre() {
  inputNombreFormula.value?.focus()
}

async function crearFormula() {
  const nombre = nuevoNombreFormula.value.trim().toUpperCase()
  if (!nuevoCodFormula.value || !nombre) return
  try {
    const res = await fetch('http://localhost:3000/formulas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CodFormula: nuevoCodFormula.value, Nombre: nombre })
    })
    if (!res.ok) throw new Error('Error al crear')
    const creada = await res.json()
    listaFormulas.value.push(creada)
    asegurarEntradas() // ⬅ nuevo: prepara las celdas de la fórmula recién creada
    nuevoCodFormula.value = ''
    nuevoNombreFormula.value = ''
  } catch (err) {
    console.error(err)
    error.value = 'No se pudo crear la fórmula (¿el código ya existe?)'
  }
}

// ---- Editar / eliminar fórmula ----
const editandoFormula = ref(null) // CodFormula que se está editando, o null
const nombreEdicion = ref('')

function empezarEdicion(f) {
  editandoFormula.value = f.CodFormula
  nombreEdicion.value = f.Nombre
}

function cancelarEdicion() {
  editandoFormula.value = null
  nombreEdicion.value = ''
}

const historialAbierto = ref(null) // CodFormula que se está mostrando, o null
const historialData = ref([])
const cargandoHistorial = ref(false)

async function abrirHistorial(f) {
  historialAbierto.value = f.CodFormula
  cargandoHistorial.value = true
  try {
    const res = await fetch(`http://localhost:3000/formulas/${f.CodFormula}/historial`)
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

function nombreInsumo(codArticulo) {
  const i = insumosDisponibles.value.find(x => x.CodArticulo === codArticulo)
  return i ? i.DetalleArticulo : codArticulo
}

async function guardarEdicion(f) {
  const nombre = nombreEdicion.value.trim().toUpperCase()
  if (!nombre) return
  try {
    const res = await fetch(`http://localhost:3000/formulas/${f.CodFormula}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Nombre: nombre })
    })
    if (!res.ok) throw new Error('Error al actualizar')
    f.Nombre = nombre
    f.FechaModificacion = new Date().toISOString() // 👈
    editandoFormula.value = null
  } catch (err) {
    console.error(err)
    error.value = `No se pudo actualizar la fórmula ${f.CodFormula}.`
  }
}

async function eliminarFormula(f) {
  if (!confirm(`¿Eliminar la fórmula ${f.CodFormula} — ${f.Nombre}? Esto borra también todas las cantidades cargadas para esa fórmula.`)) return
  try {
    const res = await fetch(`http://localhost:3000/formulas/${f.CodFormula}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Error al eliminar')

    listaFormulas.value = listaFormulas.value.filter(x => x.CodFormula !== f.CodFormula)
    formulasSeleccionadas.value = formulasSeleccionadas.value.filter(c => c !== f.CodFormula)

    // limpiar las celdas de esa fórmula de las entradas locales
    const nuevas = { ...entradas.value }
    for (const k of Object.keys(nuevas)) {
      if (k.startsWith(`${f.CodFormula}::`)) delete nuevas[k]
    }
    entradas.value = nuevas
  } catch (err) {
    console.error(err)
    error.value = `No se pudo eliminar la fórmula ${f.CodFormula}.`
  }
}

function aKilos(valor, unidad) {
  const n = Number(valor)
  if (isNaN(n)) return 0
  return unidad === 'gramos' ? n / 1000 : n
}

async function guardarCelda(codFormula, codArticulo) {
  const k = clave(codFormula, codArticulo)
  const e = entradas.value[k]

  if (!e || e.valor === '' || e.valor === null || e.valor === undefined) {
    try {
      await fetch(`http://localhost:3000/formulas/${codFormula}/${codArticulo}`, { method: 'DELETE' })
      const f = listaFormulas.value.find(x => x.CodFormula === codFormula)
      if (f) f.FechaModificacion = new Date().toISOString() // 👈
    } catch (err) {
      console.error(err)
    }
    if (e) e.valor = ''
    return
  }

  const cantidadKg = aKilos(e.valor, e.unidad)
  try {
    const res = await fetch(`http://localhost:3000/formulas/${codFormula}/${codArticulo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Cantidad: cantidadKg, Unidad: e.unidad })
    })
    if (!res.ok) throw new Error('Error al guardar')
    const f = listaFormulas.value.find(x => x.CodFormula === codFormula)
    if (f) f.FechaModificacion = new Date().toISOString() // 👈
  } catch (err) {
    console.error(err)
    error.value = `No se pudo guardar ${codArticulo} en la fórmula ${codFormula}.`
  }
}

// ---- Suma por fórmula (columna), siempre en kg ----
function totalFormula(codFormula) {
  let total = 0
  for (const f of filas.value) {
    const k = clave(codFormula, f.CodArticulo)
    const e = entradas.value[k]
    if (e) total += aKilos(e.valor, e.unidad)
  }
  return total
}

function formatKg(valor) {
  const n = Number(valor)
  if (isNaN(n)) return '0'
  // redondeo a 3 decimales para evitar arrastrar errores de coma flotante (ej: 0.1 + 0.2)
  const redondeado = Math.round(n * 1000) / 1000
  return redondeado.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  })
}

function formatFecha(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// ---- Exportar a Excel ----
async function exportarExcel() {
  const cols = columnas.value   // fórmulas visibles (respeta el filtro de columnas)
  const rows = filas.value      // insumos visibles (respeta la búsqueda)
  if (!cols.length || !rows.length) return

  const redondear = n => Math.round(n * 1000) / 1000
  const kgDeCelda = (codFormula, codArticulo) => {
    const e = entradas.value[clave(codFormula, codArticulo)]
    if (!e || e.valor === '' || e.valor === null || e.valor === undefined) return ''
    return redondear(aKilos(e.valor, e.unidad))
  }

  // ----- Paleta (mismos tonos que usaste a mano) -----
  const ROJO_FUERTE = 'DA9694' // etiqueta "TOTAL"
  const ROJO_MEDIO  = 'E6B8B7' // cabecera de fórmulas
  const ROJO_SUAVE  = 'F2DCDB' // títulos de columnas, códigos y totales

  const linea = { style: 'thin', color: { rgb: '000000' } }
  const bordeCompleto = { top: linea, bottom: linea, left: linea, right: linea }

  // ----- Hoja 1: matriz -----
  const aoa = [
    ['', 'Código fórmula',       ...cols.map(f => f.CodFormula)],
    ['', 'Nombre',               ...cols.map(f => f.Nombre)],
    ['', 'Última modificación',  ...cols.map(f => formatFecha(f.FechaModificacion))],
    ['Cód. insumo', 'Detalle insumo', ...cols.map(() => 'Cantidad (kg)')],
    ...rows.map(i => [
      i.CodArticulo,
      i.DetalleArticulo,
      ...cols.map(f => kgDeCelda(f.CodFormula, i.CodArticulo))
    ]),
    ['', 'TOTAL (kg)', ...cols.map(f => redondear(totalFormula(f.CodFormula)))]
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  const totalFilas = aoa.length
  const totalCols = 2 + cols.length
  const filaTotal = totalFilas - 1

  // Aplica un estilo a una celda (la crea vacía si no existe)
  const estilo = (r, c, s) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { t: 's', v: '' }
    ws[ref].s = { font: { name: 'Calibri', sz: 12 }, ...s }
  }
  const relleno = rgb => ({ fgColor: { rgb } })

  for (let r = 0; r < totalFilas; r++) {
    for (let c = 0; c < totalCols; c++) {
      // Cabecera (filas 0 a 2): un solo bloque rosado, sin líneas horizontales internas
      if (r <= 2 && c >= 1) {
        estilo(r, c, {
          fill: relleno(ROJO_FUERTE),
          alignment: { horizontal: 'center', vertical: 'center' },
          font: { name: 'Calibri', sz: r === 2 && c >= 2 ? 10 : 12 }, // fecha más chica
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
      // Fila de totales
      else if (r === filaTotal) {
        if (c === 1) estilo(r, c, { fill: relleno(ROJO_FUERTE), border: bordeCompleto })
        else if (c >= 2) estilo(r, c, { fill: relleno(ROJO_SUAVE), border: bordeCompleto })
      }
      // Cuerpo: columna de códigos con fondo suave, el resto blanco con bordes
      else if (r > 3) {
        estilo(r, c, {
          fill: c === 0 ? relleno(ROJO_SUAVE) : undefined,
          border: bordeCompleto
        })
      }
    }
  }

  ws['!cols'] = [{ wch: 14 }, { wch: 38 }, ...cols.map(() => ({ wch: 20 }))]


  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fórmulas')

  const ahora = new Date()
  const hoy = ahora.toISOString().slice(0, 10)
  const hora = ahora.toTimeString().slice(0, 5).replace(':', '-')
  const nombreArchivo = `formulas_${hoy}_${hora}.xlsx`

  try {
    error.value = ''
    exito.value = ''
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const fd = new FormData()
    fd.append('excel', blob, nombreArchivo)

    const res = await fetch('http://localhost:3000/formulas/exportar-excel', {
      method: 'POST',
      body: fd
    })
    if (!res.ok) throw new Error('Error al guardar')
    const data = await res.json()
    exito.value = `Excel guardado en: ${data.carpeta}\\${data.archivo}`
  } catch (err) {
    console.error(err)
    error.value = 'No se pudo guardar el Excel en la carpeta.'
  }
}

</script>

<template>
  <div class="formulas-app">
    <header class="app-header">
      <h1 class="titulo-principal">Fórmulas</h1>
    </header>

    <div class="envoltorio">
      <div class="card filtros-card">
        <h3 style="font-family: var(--font-display); font-weight: bold;">CREAR FÓRMULA</h3>
        <div class="filtros-fila">
          <div class="field">
            <label>Código</label>
            <input type="text" v-model="nuevoCodFormula" placeholder="Ej: 105" @keyup.enter="irANombre">
          </div>
          <div class="field">
            <label>Nombre</label>
            <input
              type="text"
              ref="inputNombreFormula"
              :value="nuevoNombreFormula"
              @input="nuevoNombreFormula = mayusculas($event)"
              placeholder="Ej: RESINA PRINGLES"
              @keyup.enter="crearFormula"
            >
          </div>
          <button class="btn btn-outline" type="button" @click="crearFormula">Crear</button>
        </div>
      </div>

      <div class="card filtros-card">
        <div class="filtros-fila">
          <div class="field">
            <label for="buscar-insumo">Buscar insumo</label>
            <input id="buscar-insumo" type="text" v-model="busquedaInsumo" placeholder="Código o detalle">
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

        <div class="field field-formulas">
          <label>Fórmulas a mostrar (columnas)</label>
          <div class="formulas-lista">
            <div
              v-for="f in formulasOrdenadas"
              :key="f.CodFormula"
              class="formula-chip"
              :class="{ activa: formulasSeleccionadas.includes(f.CodFormula) }"
            >
              <label class="formula-label">
                <input
                  type="checkbox"
                  :checked="formulasSeleccionadas.includes(f.CodFormula)"
                  @change="toggleFormula(f.CodFormula)"
                >
                {{ f.CodFormula }} — {{ f.Nombre }}
              </label>
              <button type="button" class="btn-icono btn-icono-borrar" title="Eliminar" @click="eliminarFormula(f)"><i class="bi bi-trash3-fill"></i></button>
            </div>
          </div>
          <button v-if="formulasSeleccionadas.length" type="button" class="btn btn-ghost btn-sm" @click="limpiarFormulas">
            Mostrar todas ({{ listaFormulas.length }})
          </button>
        </div>

        <p v-if="error" class="aviso aviso-error">{{ error }}</p>
        <p v-if="exito" class="aviso">{{ exito }}</p>
      </div>

      <p v-if="cargando" class="placeholder">Cargando…</p>
      <p v-else-if="filas.length === 0" class="placeholder">No hay insumos que coincidan con la búsqueda.</p>
      <p v-else-if="columnas.length === 0" class="placeholder">Todavía no creaste ninguna fórmula.</p>

      <div v-else class="tabla-scroll">
        <table class="matriz">
          <thead>
            <tr>
              <th class="esquina">Insumo</th>
              <th v-for="f in columnas" :key="f.CodFormula" class="col-formula">
                <template v-if="editandoFormula === f.CodFormula">
                  <input
                    type="text"
                    style="width: 90%;"
                    class="input-edicion-header"
                    :value="nombreEdicion"
                    @input="nombreEdicion = mayusculas($event)"
                    @keyup.enter="guardarEdicion(f)"
                    @keyup.esc="cancelarEdicion"
                  >
                  <div class="acciones-header">
                    <button type="button" class="btn-icono" title="Guardar" @click="guardarEdicion(f)">✓</button>
                    <button type="button" class="btn-icono" title="Cancelar" @click="cancelarEdicion">✕</button>
                  </div>
                </template>
                <template v-else>
                  <div class="acciones-header">
                    <button type="button" class="btn-icono" title="Historial" @click="abrirHistorial(f)"><i class="bi bi-clock-history"></i></button>
                    <button type="button" class="btn-icono" title="Editar" @click="empezarEdicion(f)"><i class="bi bi-pencil-fill"></i></button>
                    <button type="button" class="btn-icono btn-icono-borrar" title="Eliminar" @click="eliminarFormula(f)"><i class="bi bi-trash3-fill"></i></button>
                  </div>
                  <span class="col-codigo">{{ f.CodFormula }}</span>
                  <span class="col-detalle">{{ f.Nombre }}</span>
                  <span class="col-fecha">{{ formatFecha(f.FechaModificacion) }}</span>
                </template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in filas" :key="i.CodArticulo">
              <th class="fila-insumo">
                <span class="fila-codigo">{{ i.CodArticulo }}</span>
                <span class="fila-detalle">{{ i.DetalleArticulo }}</span>
              </th>
              <td v-for="f in columnas" :key="f.CodFormula + '|' + i.CodArticulo" class="celda-td">
                <div class="celda-combo">
                  <input
                      type="number"
                      step="0.001"
                      min="0"
                      class="celda"
                      v-model="entradas[clave(f.CodFormula, i.CodArticulo)].valor"
                      @change="guardarCelda(f.CodFormula, i.CodArticulo)"
                  >
                  <select
                      class="unidad-select"
                      v-model="entradas[clave(f.CodFormula, i.CodArticulo)].unidad"
                      @change="guardarCelda(f.CodFormula, i.CodArticulo)"
                  >
                      <option value="kg">kg</option>
                      <option value="gramos">gramos</option>
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th class="esquina total-col">Total</th>
              <th v-for="f in columnas" :key="'tot-' + f.CodFormula" class="col-formula total-col">
                {{ formatKg(totalFormula(f.CodFormula)) }} kg
              </th>
            </tr>
          </tfoot>
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
              <table class="version-tabla">
                <thead><tr><th>Insumo</th><th>Cantidad</th></tr></thead>
                <tbody>
                  <tr v-for="d in v.Detalle" :key="d.CodArticulo">
                    <td>{{ d.CodArticulo }} — {{ nombreInsumo(d.CodArticulo) }}</td>
                    <td>{{ d.Unidad === 'gramos' ? (d.Cantidad * 1000) + ' gramos' : d.Cantidad + ' kg' }}</td>
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

.formulas-app {
  --ink: #221f1e;
  --ink-soft: #6e6360;
  --surface: #ffffff;
  --bg: #f2efee;
  --line: #ddd6d4;
  --accent: #c1272d;
  --accent-dark: #8c1b1f;
  --accent-soft: #f7e6e5;
  --header-bg: #f0f0f0;
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

.formulas-app * {
  box-sizing: border-box;
}

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
  height: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.filtros-card {
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filtros-fila {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
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
}

.field-formulas {
  max-width: 100%;
}

input {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

#buscar-insumo {
  width: 260px;
}

.formulas-lista {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  max-height: 160px;
  overflow-y: auto;
  padding: 0.6rem;
  border-radius: 8px;
  border: 0.05rem solid var(--line);
}

.formula-chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  cursor: pointer;
  white-space: nowrap;
}

.formula-chip.activa {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-dark);
}

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
  align-self: flex-start;
}

.btn-ghost:hover {
  color: var(--accent-dark);
}

.btn-sm {
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
}

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
  padding: 2rem 0;
}

/* Matriz tipo planilla: cabecera y primera columna fijas al hacer scroll */

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
  font-size: 0.78rem;
}

.matriz th,
.matriz td {
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 0;
}

.esquina {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 3;
  background: var(--header-bg);
  min-width: 190px;
  padding: 0.5rem 0.6rem !important;
  text-align: left;
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 1rem;
  color: var(--ink-soft);
}

.col-formula {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--header-bg);
  min-width: 92px;
  max-width: 110px;
  padding: 0.4rem 0.3rem !important;
  text-align: center;
  vertical-align: bottom;
}

.col-codigo {
  display: block;
  font-size: 1rem;
  color: var(--ink-soft);
  line-height: 1.15;
  white-space: normal;
  word-break: break-word;
}

.col-detalle {
  display: block;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-dark);
  font-size: 1rem;
}

.fila-insumo {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
  min-width: 190px;
  padding: 0.4rem 0.6rem !important;
  text-align: left;
  font-weight: normal;
}

.fila-codigo {
  display: inline-block;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-dark);
  margin-right: 0.4rem;
  font-size: 0.8rem;
}

.fila-detalle {
  font-size: 0.8rem;
  color: var(--ink);
}

.celda {
  width: 100%;
  min-width: 92px;
  max-width: 110px;
  height: 100%;
  text-align: center;
  padding: 0.4rem 0.2rem;
  border: none;
  border-radius: 0;
  background: transparent;
}

.celda:focus {
  box-shadow: inset 0 0 0 2px var(--accent);
  background: var(--accent-soft);
}

tbody tr:nth-child(even) .fila-insumo {
  background: var(--bg);
}

tbody tr:nth-child(even) td {
  background: #fbfafa;
}

@media (max-width: 640px) {
  .filtros-fila {
    flex-direction: column;
    align-items: stretch;
  }

  #buscar-insumo {
    width: 100%;
  }
}

.celda-td {
  padding: 0.2rem !important;
}

.celda-combo {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  width: 100%;
}

.unidad-select {
  font-size: 0.90rem;
  padding: 0.15rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
}

.total-col {
  position: sticky;
  bottom: 0;
  background: var(--header-bg);
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-dark);
}

.formula-chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.formula-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}

.btn-icono {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.73rem;
  line-height: 1;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
  color: var(--ink);
}

.btn-icono:hover {
  background: var(--accent-soft);
  color: var(--accent-dark);
}

.btn-icono-borrar:hover {
  background: #f6d9d9;
  color: var(--accent-dark);
}

.input-edicion {
  font-size: 0.8rem;
  padding: 0.2rem 0.4rem;
  border: 1.5px solid var(--accent);
  border-radius: 6px;
  min-width: 140px;
}

.col-fecha { display:block; font-size:0.65rem; color: var(--ink-soft); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(34, 31, 30, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.modal-historial {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  width: min(600px, 92vw);
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

.version-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.version-tabla th, .version-tabla td {
  text-align: left;
  padding: 0.2rem 0.4rem;
  border-bottom: 1px solid var(--line);
}
</style>
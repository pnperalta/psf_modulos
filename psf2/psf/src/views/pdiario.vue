<script setup>
// Módulo "Parte Diario" — sigue el mismo patrón que Comanda.vue
// (filas con Enter para saltar de campo, backup a la base, PDF guardado en el servidor)

import { reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import html2pdf from 'html2pdf.js'

const API = 'http://localhost:3000'

// ==========================================
// Datos generales del parte
// ==========================================
const parte = reactive({
  id: null,
  maquina: '',
  observaciones: ''
})

const fechaHoy = computed(() => new Date().toLocaleDateString('es-AR'))

// ==========================================
// Máquinas (listado + alta/edición/borrado)
// Cada máquina tiene un Multiplicador: el factor por el que se
// multiplica la cantidad de cada bachada al elegir esa máquina
// (ej: una máquina x10, otra x50).
// ==========================================
const maquinas = ref([])
const gestionMaquinasAbierta = ref(false)
const nuevaMaquina = ref('')
const editandoMaquina = ref(null) // Id de la máquina que se está editando
const nombreEdicionMaquina = ref('')
const errorMaquinas = ref('')

async function cargarMaquinas() {
  try {
    const res = await fetch(`${API}/maquinas`)
    if (!res.ok) throw new Error()
    maquinas.value = await res.json()
  } catch (err) {
    console.error(err)
    errorMaquinas.value = 'No se pudo cargar la lista de máquinas.'
  }
}

async function crearMaquina() {
  const nombre = nuevaMaquina.value.trim()
  if (!nombre) return
  try {
    const res = await fetch(`${API}/maquinas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Nombre: nombre })
    })
    if (!res.ok) throw new Error()
    nuevaMaquina.value = ''
    await cargarMaquinas()
  } catch (err) {
    console.error(err)
    errorMaquinas.value = 'No se pudo crear la máquina (¿ya existe?).'
  }
}

function empezarEdicionMaquina(m) {
  editandoMaquina.value = m.Id
  nombreEdicionMaquina.value = m.Nombre
}

function cancelarEdicionMaquina() {
  editandoMaquina.value = null
  nombreEdicionMaquina.value = ''
}

async function guardarEdicionMaquina(m) {
  const nombre = nombreEdicionMaquina.value.trim()
  if (!nombre) return
  try {
    const res = await fetch(`${API}/maquinas/${m.Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Nombre: nombre })
    })
    if (!res.ok) throw new Error()
    if (parte.maquina === m.Nombre) parte.maquina = nombre
    cancelarEdicionMaquina()
    await cargarMaquinas()
  } catch (err) {
    console.error(err)
    errorMaquinas.value = 'No se pudo actualizar la máquina.'
  }
}

// eliminarMaquina queda igual

// 🗑 BORRAR el computed multiplicadorMaquinaActual

async function eliminarMaquina(m) {
  const confirmado = window.confirm(`¿Eliminar la máquina "${m.Nombre}"?`)
  if (!confirmado) return
  try {
    const res = await fetch(`${API}/maquinas/${m.Id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error()
    if (parte.maquina === m.Nombre) parte.maquina = ''
    await cargarMaquinas()
  } catch (err) {
    console.error(err)
    errorMaquinas.value = 'No se pudo eliminar la máquina.'
  }
}

// ==========================================
// Insumos (para armar el detalle de cada fórmula, mismo orden que la matriz)
// ==========================================
const modulouno = ref([])

async function cargarModulouno() {
  try {
    const res = await fetch(`${API}/modulouno`)
    if (!res.ok) throw new Error()
    modulouno.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

const insumoPorCodigo = computed(() => {
  const mapa = {}
  modulouno.value.forEach((ins, indice) => {
    mapa[ins.CodArticulo] = { DetalleArticulo: ins.DetalleArticulo, orden: indice }
  })
  return mapa
})

// ==========================================
// Filas de fórmulas (código + bachadas) — límite 12
// ==========================================

const formulas = ref([])

async function cargarFormulas() {
  try {
    const res = await fetch(`${API}/formulas`)
    formulas.value = res.ok ? await res.json() : []
  } catch (err) {
    console.error(err)
  }
}

const LIMITE_FORMULAS = 12

function crearFila() {
  return {
    id: crypto.randomUUID(),
    codFormula: '',
    bachadas: '',
    multiplicador: '',
    nombre: '',
    insumos: [],
    buscando: false,
    error: '',
    // buscador
    busqueda: '',
    listaAbierta: false,
    filtrando: false,
    indiceActivo: 0
  }
}

const filas = reactive([crearFila()])

function agregarFila() {
  if (filas.length < LIMITE_FORMULAS) filas.push(crearFila())
}

function quitarFila(id) {
  const indice = filas.findIndex(f => f.id === id)
  if (indice !== -1) filas.splice(indice, 1)
}

async function buscarFormulaFila(fila) {
  fila.nombre = ''
  fila.insumos = []
  fila.error = ''

  if (!fila.codFormula) return

  fila.buscando = true
  try {
    const res = await fetch(`${API}/formulas/${fila.codFormula}/detalle`)

    if (!res.ok) {
      fila.error = res.status === 404 ? 'Fórmula no encontrada.' : 'Error al buscar la fórmula.'
      return
    }

    const data = await res.json()
    fila.nombre = data.Nombre
    fila.insumos = data.insumos
  } catch (err) {
    console.error(err)
    fila.error = 'No se pudo conectar con el servidor.'
  } finally {
    fila.buscando = false
  }
}

// ==========================================
// Buscador de fórmulas (por fila)
// ==========================================
function normalizar(t) {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function etiquetaFormula(f) {
  return `${f.CodFormula} — ${f.Nombre}`
}

function formulasFiltradas(fila) {
  if (!fila.filtrando) return formulas.value
  const q = normalizar(fila.busqueda)
  if (!q) return formulas.value

  return formulas.value
    .filter(f => normalizar(`${f.CodFormula} ${f.Nombre}`).includes(q))
    .sort((a, b) => {
      const ea = normalizar(a.CodFormula).startsWith(q) ? 0 : 1
      const eb = normalizar(b.CodFormula).startsWith(q) ? 0 : 1
      return ea - eb
    })
}

function alEscribir(fila, event) {
  fila.busqueda = event.target.value
  fila.filtrando = true
  fila.listaAbierta = true
  fila.indiceActivo = 0

  // Si borró todo, se limpia la fórmula elegida
  if (!fila.busqueda.trim() && fila.codFormula) {
    fila.codFormula = ''
    buscarFormulaFila(fila)
  }
}

function alEnfocar(fila, event) {
  fila.filtrando = false
  fila.listaAbierta = true
  const i = formulas.value.findIndex(f => f.CodFormula === fila.codFormula)
  fila.indiceActivo = i === -1 ? 0 : i
  event.target.select()
}

function alDesenfocar(fila) {
  fila.listaAbierta = false
  fila.filtrando = false
  const elegida = formulas.value.find(f => f.CodFormula === fila.codFormula)
  fila.busqueda = elegida ? etiquetaFormula(elegida) : ''
}

async function moverIndice(fila, delta) {
  if (!fila.listaAbierta) {
    fila.listaAbierta = true
    return
  }
  const max = formulasFiltradas(fila).length - 1
  fila.indiceActivo = Math.max(0, Math.min(max, fila.indiceActivo + delta))
  await nextTick()
  document.querySelector(`#lista-${fila.id} .activa`)?.scrollIntoView({ block: 'nearest' })
}

function elegirFormula(fila, f) {
  fila.codFormula = f.CodFormula
  fila.busqueda = etiquetaFormula(f)
  fila.filtrando = false
  fila.listaAbierta = false
  buscarFormulaFila(fila) // carga nombre e insumos
}

function enfocarBachadas(fila) {
  const el = document.getElementById(`bach-${fila.id}`)
  el?.focus()
  el?.select()
}

function manejarEnterCodigo(fila, event) {
  if (fila.listaAbierta) {
    const f = formulasFiltradas(fila)[fila.indiceActivo]
    if (!f) return
    elegirFormula(fila, f)
    irCampoSiguiente(event)
    return
  }
  if (fila.codFormula) irCampoSiguiente(event)
}

async function manejarEnterBachadas(fila, event) {
    irCampoSiguiente(event)
}

async function manejarEnterMultiplicador(fila, event) {
  if (filas.length < LIMITE_FORMULAS) {
    agregarFila()
    await nextTick()

    
    const formulario = event.target.closest('form')
    const nuevaFila = filas[filas.length - 1]
    const siguienteInput = formulario?.querySelector(`#codf-${nuevaFila.id}`)

    if (siguienteInput) {
      siguienteInput.focus()
      siguienteInput.select()
    }
  } else {
    irCampoSiguiente(event)
   }
}

// ==========================================
// Cálculo del detalle mostrado (aplica el multiplicador de bachadas
// Y el multiplicador de la máquina elegida)
// ==========================================
function formatNumeroAR(n) {
  const num = Number(n)
  if (!isFinite(num)) return '0'
  let s = num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (s === '' || s === '-') s = '0'
  return s.replace('.', ',')
}

function detalleInsumos(fila) {
  if (!fila.insumos || fila.insumos.length === 0) return []
  const bachadas = Number(fila.bachadas) || 1
  const multiplicador = Number(fila.multiplicador) || 1   // 👈 de la fila
  return fila.insumos
    .map(ins => {
      const meta = insumoPorCodigo.value[ins.CodArticulo]
      const cantidadKgBase = ins.Unidad === 'gramos' ? Number(ins.Cantidad) / 1000 : Number(ins.Cantidad)
      return {
        detalle: meta?.DetalleArticulo || ins.CodArticulo,
        orden: meta ? meta.orden : 9999,
        cantidadKg: cantidadKgBase * bachadas * multiplicador
      }
    })
    .sort((a, b) => a.orden - b.orden)
}

function totalKgFila(fila) {
  return detalleInsumos(fila).reduce((acc, i) => acc + i.cantidadKg, 0)
}

function textoTarea(fila) {
  if (!fila.nombre) return ''
  const partes = detalleInsumos(fila).map(i => `${formatNumeroAR(i.cantidadKg)} KG ${i.detalle}`)
  if (partes.length === 0) return fila.nombre
  return `${fila.nombre} -- (${partes.join(' - ')} -- TOTAL ${formatNumeroAR(totalKgFila(fila))} KG)`
}

// ==========================================
// Guardado de borrador en curso (por si se recarga la página)
// ==========================================
const ESTADO_STORAGE_KEY = 'psf_parte_diario_estado_trabajo'

function guardarEstadoTrabajo() {
  try {
    localStorage.setItem(ESTADO_STORAGE_KEY, JSON.stringify({
      parte: { ...parte },
      filas: filas.map(f => ({ ...f }))
    }))
  } catch (err) {
    console.error('No se pudo guardar el estado del parte diario', err)
  }
}

function cargarEstadoTrabajo() {
  try {
    const guardado = localStorage.getItem(ESTADO_STORAGE_KEY)
    if (!guardado) return
    const estado = JSON.parse(guardado)
    if (estado.parte) Object.assign(parte, estado.parte)
    if (Array.isArray(estado.filas) && estado.filas.length) {
     filas.splice(0, filas.length, ...estado.filas.map(f => ({
  ...crearFila(), ...f, listaAbierta: false, filtrando: false, indiceActivo: 0
})))
    }
  } catch (err) {
    console.error('No se pudo leer el borrador guardado del parte diario', err)
  }
}

watch(() => [parte, filas], guardarEstadoTrabajo, { deep: true })

function limpiarParte() {
  parte.id = null
  parte.maquina = ''
  parte.observaciones = ''
  filas.splice(0, filas.length, crearFila())
  localStorage.removeItem(ESTADO_STORAGE_KEY)
}

// ==========================================
// Navegación con Enter (igual que en Comanda)
// ==========================================
function evitarEnvioPorEnter(event) {
  const objetivo = event.target
  if (objetivo.tagName === 'INPUT' || objetivo.tagName === 'SELECT') {
    event.preventDefault()
  }
}

function irCampoSiguiente(event) {
  const formulario = event.target.closest('form')
  if (!formulario) return

  const campos = Array.from(
    formulario.querySelectorAll('input:not([disabled]), select:not([disabled])')
  )
  const indiceActual = campos.indexOf(event.target)
  if (indiceActual === -1) return

  const siguienteCampo = campos[indiceActual + 1]
  if (siguienteCampo) {
    siguienteCampo.focus()
    if (typeof siguienteCampo.select === 'function') siguienteCampo.select()
  }
}

// ==========================================
// Atajos de teclado
// ==========================================
function manejarAtajosTeclado(event) {
  if (event.ctrlKey && (event.key === 'p' || event.key === 'P')) {
    event.preventDefault()
    imprimir()
  } else if (event.ctrlKey && (event.key === 'ñ' || event.key === 'Ñ')) {
    event.preventDefault()
    limpiarParte()
  }
}

onMounted(async () => {
  cargarMaquinas()
  cargarModulouno()
  await cargarFormulas()
  cargarEstadoTrabajo()
  window.addEventListener('keydown', manejarAtajosTeclado)
})

onUnmounted(() => {
  window.removeEventListener('keydown', manejarAtajosTeclado)
})

// ==========================================
// Imprimir / generar y guardar PDF
// ==========================================
async function imprimir() {
  await nextTick()

  const imagenes = Array.from(document.querySelectorAll('#impresion-parte img'))
  await Promise.all(
    imagenes.map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    })
  )

  const numero = await guardarBackupParte()
  if (numero) {
    parte.id = numero
    await nextTick() // deja que el DOM pinte el número antes de capturar el PDF
  }

  const pdfBlob = await generarPdfBlob()
  await guardarPdfParte(pdfBlob, numero)

  window.print()
}

async function guardarBackupParte() {
  try {
    const res = await fetch(`${API}/partes/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maquina: parte.maquina,
        observaciones: parte.observaciones,
        fecha: fechaHoy.value,
        items: filas.map((f, i) => ({
        item: i + 1,
        codFormula: f.codFormula,
        nombre: f.nombre,
        bachadas: f.bachadas,
        multiplicador: f.multiplicador,   // 👈
        tarea: textoTarea(f),
        totalKg: totalKgFila(f)
        }))
      })
    })
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.numero
  } catch (err) {
    console.error('No se pudo guardar el backup del parte diario', err)
    return null
  }
}

async function generarPdfBlob() {
  const elemento = document.getElementById('impresion-parte')
  if (document.fonts?.ready) await document.fonts.ready

  elemento.classList.add('pdf-render')

  const opciones = {
    margin: [10, 0, 0, 0],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  }

  try {
    return await html2pdf().set(opciones).from(elemento).outputPdf('blob')
  } finally {
    elemento.classList.remove('pdf-render')
  }
}

async function guardarPdfParte(blobPdf, numero) {
  const maquinaArchivo = (parte.maquina || 'sin-maquina').replace(/\s+/g, '-')
  const fechaArchivo = fechaHoy.value.replaceAll('/', '-')
  const nombreArchivo = `parte-${maquinaArchivo}-${fechaArchivo}-${Date.now()}.pdf`

  const formData = new FormData()
  formData.append('pdf', blobPdf, nombreArchivo)
  if (numero) formData.append('numero', numero)

  try {
    const res = await fetch(`${API}/partes/backup-pdf`, {
      method: 'POST',
      body: formData
    })
    if (!res.ok) throw new Error('Error al guardar el PDF')
  } catch (err) {
    console.error('No se pudo guardar el PDF del parte diario', err)
  }
}
</script>

<template>
  <div class="parte-app">
    <header class="app-header no-print">
      <p class="eyebrow">Producción</p>
      <h1 class="titulo-principal">Parte Diario</h1>
    </header>

    <div class="atajos-flotante no-print">
      <p class="atajos-titulo">Atajos</p>
      <p><kbd>Ctrl</kbd> + <kbd>P</kbd> imprimir</p>
      <p><kbd>Ctrl</kbd> + <kbd>Ñ</kbd> limpiar parte</p>
    </div>

    <div class="pantalla no-print">
      <div class="card parte-form">
        <h2 class="card-title">Datos del parte</h2>

        <form action="" method="post" class="form-grid" @submit.prevent @keydown.enter="evitarEnvioPorEnter">
          <div class="field" style="grid-column: 1 / -1;">
            <label for="maquina">Máquina</label>
            <select id="maquina" v-model="parte.maquina" @keyup.enter="irCampoSiguiente">
              <option disabled value="">Elegí una máquina</option>
              <option v-for="m in maquinas" :key="m.Id" :value="m.Nombre">{{ m.Nombre }}</option>
            </select>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              style="align-self: flex-start; margin-top: 0.3rem;"
              @click="gestionMaquinasAbierta = !gestionMaquinasAbierta"
            >
              {{ gestionMaquinasAbierta ? 'Cerrar gestión de máquinas' : 'Agregar / quitar / editar máquinas' }}
            </button>

            <div v-if="gestionMaquinasAbierta" class="gestion-maquinas">
              <div class="filtros-fila">
                <input
                  type="text"
                  v-model="nuevaMaquina"
                  placeholder="Nombre de la máquina nueva"
                  @keyup.enter="crearMaquina"
                >
                <button type="button" class="btn btn-outline btn-sm" @click="crearMaquina">Agregar</button>
              </div>
              <p v-if="errorMaquinas" class="state-msg" style="color: var(--danger);">{{ errorMaquinas }}</p>

              <div class="maquinas-lista">
                <div v-for="m in maquinas" :key="m.Id" class="formula-chip">
                  <template v-if="editandoMaquina === m.Id">
                    <input
                      type="text"
                      class="input-edicion"
                      v-model="nombreEdicionMaquina"
                      @keyup.enter="guardarEdicionMaquina(m)"
                      @keyup.esc="cancelarEdicionMaquina"
                    >
                    <button type="button" class="btn-icono" title="Guardar" @click="guardarEdicionMaquina(m)">✓</button>
                    <button type="button" class="btn-icono" title="Cancelar" @click="cancelarEdicionMaquina">✕</button>
                  </template>
                  <template v-else>
                    <span>{{ m.Nombre }}</span>
                    <button type="button" class="btn-icono" title="Editar" @click="empezarEdicionMaquina(m)">✎</button>
                    <button type="button" class="btn-icono btn-icono-borrar" title="Eliminar" @click="eliminarMaquina(m)">🗑</button>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div class="field" style="grid-column: 1 / -1;">
            <label for="obs">Observaciones para la tarea</label>
            <input
              type="text"
              id="obs"
              v-model="parte.observaciones"
              placeholder="Detalle u observaciones"
              @keyup.enter="irCampoSiguiente"
            >
          </div>

          <div v-for="(fila, index) in filas" :key="fila.id" class="fila-formula">
            <span class="numfila">FÓRMULA {{ index + 1 }}</span>

            <div class="fila-campos">
              <!-- Código -->
              <div class="field combo">
                <label :for="'codf-' + fila.id">Código de fórmula</label>
                <input
                  type="text"
                  :id="'codf-' + fila.id"
                  autocomplete="off"
                  placeholder="Escribí el código o el nombre…"
                  role="combobox"
                  :aria-controls="'lista-' + fila.id"
                  :aria-expanded="fila.listaAbierta"
                  :value="fila.busqueda"
                  @input="alEscribir(fila, $event)"
                  @focus="alEnfocar(fila, $event)"
                  @blur="alDesenfocar(fila)"
                  @keydown.down.prevent="moverIndice(fila, 1)"
                  @keydown.up.prevent="moverIndice(fila, -1)"
                  @keydown.esc="fila.listaAbierta = false"
                  @keyup.enter="(e) => manejarEnterCodigo(fila, e)"
                >
                <ul v-if="fila.listaAbierta" :id="'lista-' + fila.id" class="combo-lista" role="listbox">
                  <li
                    v-for="(f, i) in formulasFiltradas(fila)"
                    :key="f.CodFormula"
                    role="option"
                    :aria-selected="i === fila.indiceActivo"
                    :class="{ activa: i === fila.indiceActivo }"
                    @mousemove="fila.indiceActivo = i"
                    @mousedown.prevent="elegirFormula(fila, f); enfocarBachadas(fila)"
                  >
                    <strong>{{ f.CodFormula }}</strong> — {{ f.Nombre }}
                  </li>
                  <li v-if="formulasFiltradas(fila).length === 0" class="combo-vacio">Sin resultados</li>
                </ul>
                <p v-if="fila.buscando" class="state-msg">Buscando…</p>
                <p v-if="fila.error" class="state-msg" style="color: var(--danger);">{{ fila.error }}</p>
              </div>

              <!-- Bachadas -->
              <div class="field">
                <label :for="'bach-' + fila.id">Bachadas</label>
                <input
                  type="number" min="1" step="1" placeholder="1"
                  :id="'bach-' + fila.id"
                  v-model="fila.bachadas"
                  @keyup.enter="(e) => manejarEnterBachadas(fila, e)"
                >
              </div>

              <!-- Multiplicador -->
              <div class="field">
                <label :for="'multiplicador-' + fila.id">Multiplicador</label>
                <input
                  type="number" min="1" step="1" placeholder="1"
                  :id="'multiplicador-' + fila.id"
                  v-model="fila.multiplicador"
                  @keyup.enter="(e) => manejarEnterMultiplicador(fila, e)"
                >
              </div>

              <!-- KG total (previsualización) -->
              <div class="field">
                <label>KG total</label>
                <div class="kg-box" :class="{ vacio: !fila.nombre }">
                  <strong>{{ fila.nombre ? formatNumeroAR(totalKgFila(fila)) : '—' }}</strong>
                  <span>KG</span>
                </div>
              </div>
            </div>

            <div v-if="filas.length > 1" class="fila-pie">
              <button type="button" 
              class="btn btn-sm btn-ghost btn-quitar" 
              @click="quitarFila(fila.id)">
                ✕ Quitar fórmula
              </button>
            </div>
          </div>

          <div class="field" style="grid-column: 1 / -1;" v-if="filas.length < LIMITE_FORMULAS">
            <button type="button" class="btn btn-sm btn-outline" @click="agregarFila">+ Agregar fórmula</button>
          </div>
        </form>

        <div class="form-submit">
          <button class="btn btn-outline" type="button" @click="limpiarParte" style="width: 100%;">Limpiar parte</button>
        </div>
      </div>
    </div>

    <div class="vp">
      <h2 class="card-title vp-title no-print">Vista previa</h2>
      <div class="impresion" id="impresion-parte">
        <div class="hoja">
          <div class="hoja-header">
            <div class="logo">
              <img style="width: 40%;" src="@/assets/logotres.png" alt="LogoPSF" />
            </div>
            <div class="titulo-parte" style="margin-top: 2%;">
              <p class="parte-label">PARTE DIARIO: {{ parte.id }}</p>
              <p class="parte-maquina">{{ parte.maquina || '—' }}</p>
              <p class="fecha-orden">{{ fechaHoy }}</p>
            </div>
          </div>

          <span class="etq" style="margin-bottom: 1rem;">OBSERVACIONES:</span>

          <div class="obs-box">
            <span>{{ parte.observaciones }}</span>
          </div>

          <table class="tabla-parte">
            <thead>
              <tr>
                <th class="col-item">ITEM</th>
                <th class="col-codigo">CODIGO</th>
                <th class="col-tarea">TAREA</th>
                <th class="col-accion">BACHADAS</th>
                <th class="col-resp">RESPONSABLE</th>
                <th class="col-kg">KG</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in LIMITE_FORMULAS" :key="n">
                <td class="col-item">{{ n }}</td>
                <td class="col-codigo">{{ filas[n - 1]?.codFormula || '' }}</td>
                <td class="col-tarea">{{ filas[n - 1] ? textoTarea(filas[n - 1]) : '' }}</td>
                <td class="col-bachada">{{ filas[n - 1]?.bachadas || '' }}</td>
                <td class="col-resp"></td>
                <td class="col-kg"></td>
              </tr>
            </tbody>
          </table>

          <div class="novedades"><span class="etq">NOVEDADES:</span></div>
        </div>
      </div>
        <button style="margin-top: 5%;" class="btn btn-primary btn-imprimir no-print" type="button" @click="imprimir">Imprimir / Guardar PDF</button>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.parte-app {
  --ink: #221f1e;
  --ink-soft: #6e6360;
  --surface: #ffffff;
  --bg: #f2efee;
  --line: #ddd6d4;
  --accent: #c1272d;
  --accent-dark: #8c1b1f;
  --accent-soft: #f7e6e5;
  --danger: #8c1b1f;
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

.parte-app * {
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

.atajos-flotante {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.9rem 1.1rem;
  font-size: 0.82rem;
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

.atajos-flotante kbd {
  font-family: var(--font-mono);
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
  padding: 0.05rem 0.4rem;
  font-size: 0.78rem;
}

.pantalla {
  display: flex;
  justify-content: center;
  max-width: 800px;
  
  margin: 0 auto 3rem;
  padding: 0 1.5rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.card.parte-form {
  width: 100%;
  padding: 1.75rem 2rem;
}

.card-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0 0 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem 1.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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

.fieldgrup {
  display: flex;
  gap: 0.5rem;
}

.fieldgrup input {
  flex: 1;
}

.fieldgrup label {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
  margin: 0;
}

.fila-formula {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem 1rem 0.6rem;
  background: #faf8f8;
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius);
}

.fila-campos {
  display: grid;
  grid-template-columns: 1fr 105px 120px minmax(130px, auto);
  gap: 0.75rem;
  align-items: end;
}

.kg-box {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  min-height: 2.75rem;
  white-space: nowrap;
  max-width: 100%;
}

.kg-box strong {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.kg-box span {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.kg-box.vacio {
  background: transparent;
  border-color: var(--line);
  color: var(--ink-soft);
}

.fila-pie {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--line);
  padding-top: 0.35rem;
}

.numfila {
  font-weight: bold;
  font-size: 0.78rem;
  color: var(--accent-dark);
  font-family: var(--font-display);
}

input,
select {
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

input:focus,
select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.state-msg {
  font-size: 0.8rem;
  color: var(--ink-soft);
  margin: 0;
}

.formula-encontrada {
  color: var(--accent-dark);
  font-weight: 600;
}

.gestion-maquinas {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.75rem;
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filtros-fila {
  display: flex;
  gap: 0.5rem;
}

.filtros-fila input {
  flex: 1;
}

.maquinas-lista {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  max-height: 160px;
  overflow-y: auto;
}

.formula-chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  border: 1.5px solid var(--line);
}

.input-edicion {
  font-size: 0.8rem;
  padding: 0.2rem 0.4rem;
  border: 1.5px solid var(--accent);
  border-radius: 6px;
  min-width: 140px;
  width: auto;
}

.btn {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0.65rem 1.3rem;
  border-radius: 8px;
  border: 1.5px solid transparent;
  cursor: pointer;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  background: var(--accent-dark);
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
  color: var(--accent-dark);
}

.btn-ghost:hover {
  color: var(--danger);
}

.btn-sm {
  padding: 0.35rem 0.8rem;
  font-size: 0.82rem;
}

.btn-icono {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
}

.btn-icono:hover {
  background: var(--accent-soft);
  color: var(--accent-dark);
}

.btn-icono-borrar:hover {
  background: #f6d9d9;
}

.btn-quitar {
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.btn-quitar:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-dark);
}

.btn-quitar:active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.form-submit {
  margin-top: 1.25rem;
}

.btn-imprimir {
  margin-bottom: 2rem;
}

/* Vista previa / impresión */

.vp {
  max-width: 900px;
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
  justify-content: center;
}

.hoja {
  width: 200mm;
  min-height: 230mm;
  background: #ffffff;
  padding: 2rem 2.2rem;
  box-sizing: border-box;
  font-family: var(--font-body), Arial, Helvetica, sans-serif;
  color: #000;
  box-shadow: var(--shadow);
}

.hoja-header {
  display: block;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
  margin-bottom: 12px;
}

.logo img {
  width: 40%;
}

.titulo-parte {
  display: flex;
  text-align: center;
  gap: 3rem;
}

.parte-label {
  margin-left: -3.5%;
  font-size: 16px;
  width: 80%;
  margin-top: 1.8%;
  font-weight: bold;
  text-transform: uppercase;
}

.parte-maquina {
  font-size: 30px;
  text-transform: uppercase;
  text-align: center;
  width: 100%;
  font-weight: 800;
  font-family: var(--font-display);
}

.fecha-orden {
  margin-left: 6rem;
  text-align: left;
  margin-top: 1.8%;
  font-size: 15px;
  color: #252525;
}

.obs-box {
  border: 1px solid #000;
  border-radius: 4px;
  padding: 0.6rem 0.8rem;
  margin-bottom: 14px;
  font-size: 14px;
  min-height: 2.4rem;
  text-align: center;
}

.etq {
  font-weight: bold;
  margin-right: 6px;
}

.tabla-parte {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tabla-parte th,
.tabla-parte td {
  border: 1px solid #000;
  padding: 6px 8px;
  vertical-align: middle;
}

.tabla-parte th {
  background-color: #f0f0f0;
  font-size: 12px;
  text-transform: uppercase;
}

.col-item {
  width: 6%;
  text-align: center;
}

.col-codigo {
  width: 9%;
  text-align: center;
  font-weight: 700;
}

.col-tarea {
  width: 50%;
  text-align: left;
  font-size: 12px;
}

.col-bachada {
  width: 7%;
  text-align: center;
}

.col-resp {
  text-align: center;
  width: 18%;
}

.col-kg {
  width: 10%;
  text-align: center;
}

.novedades {
  border-top: 2px solid #000;
  margin-top: 18px;
  padding-top: 10px;
  font-size: 14px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .card.parte-form {
    padding: 1.25rem;
  }

  .fila-campos {
    grid-template-columns: 1fr 1fr;
  }

  .fila-campos .combo {
    grid-column: 1 / -1;
  }  

  .pantalla,
  .vp {
    padding: 0 1rem;
  }
}

.pdf-render .hoja {
  box-shadow: none;
}

@media print {
  body * {
    visibility: hidden;
  }

  #impresion-parte,
  #impresion-parte * {
    visibility: visible;
  }

  #impresion-parte {
    position: absolute;
    top: 0;
    left: 0;
    width: 210mm;
  }

  .no-print {
    display: none !important;
  }

  .hoja {
    box-shadow: none;
    width: 200mm;
    margin: 0 auto;
  }

  @page {
    size: custom 210mm 297mm;
    margin: 0;
  }
}

.combo {
  position: relative;
}

.combo-lista {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  z-index: 20;
}

.combo-lista li {
  padding: 0.5rem 0.65rem;
  font-size: 0.9rem;
  border-radius: 6px;
  cursor: pointer;
}

.combo-lista li.activa {
  background: var(--accent-soft);
  color: var(--accent-dark);
}

.combo-lista li.combo-vacio {
  color: var(--ink-soft);
  cursor: default;
}
</style>
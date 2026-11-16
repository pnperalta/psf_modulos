<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import html2pdf from 'html2pdf.js'

const formulas = ref([])
const insumos = ref([])
const codFormula = ref('')
const bachadas = ref(1)
const detalleFormula = ref([])
const nombreFormula = ref('')
const cargando = ref(false)

// Datos del encabezado de la hoja
const CLAVE_ORDEN = 'ultimaOrden'
const ultimaOrden = ref(Number(localStorage.getItem(CLAVE_ORDEN)) || 0)
const numeroOrden = computed(() => ultimaOrden.value + 1)

// Se ejecuta con el botón Imprimir y también con Ctrl+P
function alTerminarImpresion() {
  if (!codFormula.value) return
  ultimaOrden.value = numeroOrden.value
  localStorage.setItem(CLAVE_ORDEN, ultimaOrden.value)
}
const fechaHoy = computed(() => new Date().toLocaleDateString('es-AR'))

async function cargarFormulas() {
  const res = await fetch('http://localhost:3000/formulas')
  formulas.value = res.ok ? await res.json() : []
}

async function cargarInsumos() {
  const res = await fetch('http://localhost:3000/modulouno')
  insumos.value = res.ok ? await res.json() : []
}

onMounted(() => {
  cargarFormulas()
  cargarInsumos()
  window.addEventListener('keydown', manejarAtajosTeclado)
  window.addEventListener('afterprint', alTerminarImpresion)
})

onUnmounted(() => {
  window.removeEventListener('keydown', manejarAtajosTeclado)
  window.removeEventListener('afterprint', alTerminarImpresion)
})

async function onCambiarFormula() {
  if (!codFormula.value) {
    detalleFormula.value = []
    nombreFormula.value = ''
    return
  }
  cargando.value = true
  try {
    const res = await fetch(`http://localhost:3000/formulas/${codFormula.value}/detalle`)
    if (!res.ok) throw new Error('Error al obtener el detalle de la fórmula')
    const data = await res.json()
    nombreFormula.value = data.Nombre
    detalleFormula.value = data.insumos
  } catch (err) {
    console.error(err)
    detalleFormula.value = []
    nombreFormula.value = ''
  } finally {
    cargando.value = false
  }
}

// ==========================================
// Buscador de fórmulas (escribís y filtra; Enter elige y pasa a bachadas)
// ==========================================
const busqueda = ref('')
const listaAbierta = ref(false)
const filtrando = ref(false) // true solo mientras el usuario escribe; si no, muestra todas
const indiceActivo = ref(0)
const inputFormula = ref(null)
const inputBachadas = ref(null)

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

const formulasFiltradas = computed(() => {
  if (!filtrando.value) return formulas.value
  const q = normalizar(busqueda.value)
  if (!q) return formulas.value

  return formulas.value
    .filter(f => normalizar(`${f.CodFormula} ${f.Nombre}`).includes(q))
    // primero las que empiezan con lo escrito (por código), después el resto
    .sort((a, b) => {
      const ea = normalizar(a.CodFormula).startsWith(q) ? 0 : 1
      const eb = normalizar(b.CodFormula).startsWith(q) ? 0 : 1
      return ea - eb
    })
})

function alEscribir(event) {
  busqueda.value = event.target.value
  filtrando.value = true
  listaAbierta.value = true
  indiceActivo.value = 0

  // Si borró todo el texto, se limpia la fórmula elegida
  if (!busqueda.value.trim() && codFormula.value) {
    codFormula.value = ''
    onCambiarFormula()
  }
}

function alEnfocar(event) {
  filtrando.value = false
  listaAbierta.value = true
  const i = formulas.value.findIndex(f => f.CodFormula === codFormula.value)
  indiceActivo.value = i === -1 ? 0 : i
  event.target.select()
}

function alDesenfocar() {
  listaAbierta.value = false
  filtrando.value = false
  // Si quedó texto a medias, vuelve a mostrar la fórmula realmente elegida
  const elegida = formulas.value.find(f => f.CodFormula === codFormula.value)
  busqueda.value = elegida ? etiquetaFormula(elegida) : ''
}

function cerrarLista() {
  listaAbierta.value = false
}

async function moverIndice(delta) {
  if (!listaAbierta.value) {
    listaAbierta.value = true
    return
  }
  const max = formulasFiltradas.value.length - 1
  indiceActivo.value = Math.max(0, Math.min(max, indiceActivo.value + delta))
  await nextTick()
  document.querySelector('#lista-formulas .activa')?.scrollIntoView({ block: 'nearest' })
}

function enfocarBachadas() {
  inputBachadas.value?.focus()
  inputBachadas.value?.select()
}

async function elegirFormula(f) {
  codFormula.value = f.CodFormula
  busqueda.value = etiquetaFormula(f)
  filtrando.value = false
  listaAbierta.value = false
  await onCambiarFormula()
}

function alEnter() {
  // Lista abierta: elige la opción resaltada
  if (listaAbierta.value) {
    const f = formulasFiltradas.value[indiceActivo.value]
    if (!f) return
    elegirFormula(f)
    enfocarBachadas()
    return
  }
  // Lista cerrada y ya hay fórmula elegida: solo pasa a bachadas
  if (codFormula.value) enfocarBachadas()
}

// ==========================================
// Limpiar comanda + atajos de teclado
// ==========================================
function limpiarComanda() {
  codFormula.value = ''
  busqueda.value = ''
  bachadas.value = 1
  detalleFormula.value = []
  nombreFormula.value = ''
  filtrando.value = false
  indiceActivo.value = 0

  // Deja el foco en el buscador de fórmulas, listo para escribir
  inputFormula.value?.focus()
  listaAbierta.value = true
}

function manejarAtajosTeclado(event) {
  if (event.ctrlKey && (event.key === 'ñ' || event.key === 'Ñ')) {
    event.preventDefault()
    limpiarComanda()
  }
  if (event.ctrlKey && (event.key === 'p' || event.key === 'P')) {
  event.preventDefault()
  imprimir()
}
}

function nombreInsumo(codArticulo) {
  const i = insumos.value.find(x => x.CodArticulo === codArticulo)
  return i ? i.DetalleArticulo : codArticulo
}

const filas = computed(() => detalleFormula.value.map(item => {
  const kgPorBachada = Number(item.Cantidad)
  return {
    codArticulo: item.CodArticulo,
    material: nombreInsumo(item.CodArticulo),
    kgPorBachada,
    kgTotal: kgPorBachada * (Number(bachadas.value) || 0)
  }
}))

const totalKgPorBachada = computed(() => filas.value.reduce((acc, f) => acc + f.kgPorBachada, 0))
const totalKgTotal = computed(() => filas.value.reduce((acc, f) => acc + f.kgTotal, 0))

function formatKg(n) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

// Filas en blanco para "Bachadas Producidas" — se completan a mano al imprimir
const FILAS_PRODUCCION = 12
const filasProduccion = ref(Array.from({ length: FILAS_PRODUCCION }, () => crypto.randomUUID()))

async function generarPdfBlob() {
  const elemento = document.getElementById('impresion-comanda')
  if (document.fonts?.ready) await document.fonts.ready

  const opciones = {
    margin: [10, 0, 0, 0],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  }

  return await html2pdf().set(opciones).from(elemento).outputPdf('blob')
}

async function guardarPdfComanda(blobPdf) {
  const fechaArchivo = fechaHoy.value.replaceAll('/', '-')
  const nombreArchivo = `comanda-${codFormula.value}-${fechaArchivo}-${Date.now()}.pdf`

  const formData = new FormData()
  formData.append('pdf', blobPdf, nombreArchivo)
  formData.append('numero', numeroOrden.value)

  try {
    const res = await fetch('http://localhost:3000/comandas/backup-pdf', {
      method: 'POST',
      body: formData
    })
    if (!res.ok) throw new Error('Error al guardar el PDF')
  } catch (err) {
    console.error('No se pudo guardar el PDF de la comanda', err)
  }
}

async function imprimir() {
  if (!codFormula.value) return

  await nextTick()

  const imagenes = Array.from(document.querySelectorAll('#impresion-comanda img'))
  await Promise.all(
    imagenes.map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    })
  )

  const pdfBlob = await generarPdfBlob()
  await guardarPdfComanda(pdfBlob)

  window.print()
}
</script>

<template>
  <div class="comanda-app">
    <header class="app-header no-print">
      <p class="eyebrow">Producción</p>
      <h1 class="titulo-principal">Comanda de Materiales</h1>
    </header>

    <!-- Controles: no se imprimen -->
    <div class="pantalla no-print">
      <div class="atajos-flotante no-print">
        <p class="atajos-titulo">Atajos</p>
        <p><kbd>Ctrl</kbd> + <kbd>P</kbd> imprimir</p>
        <p><kbd>Ctrl</kbd> + <kbd>Ñ</kbd> limpiar comanda</p>
      </div>

      <div class="card comanda-form">
        <h2 class="card-title">Datos de la comanda</h2>

        <form class="form-grid" @submit.prevent>
        <div class="field">
          <label for="formula">Fórmula</label>

          <!-- Solo input + lista dentro del combo -->
          <div class="combo">
            <input
              id="formula"
              ref="inputFormula"
              type="text"
              autocomplete="off"
              placeholder="Escribí el código o el nombre…"
              role="combobox"
              aria-controls="lista-formulas"
              :aria-expanded="listaAbierta"
              :value="busqueda"
              @input="alEscribir"
              @focus="alEnfocar"
              @blur="alDesenfocar"
              @keydown.down.prevent="moverIndice(1)"
              @keydown.up.prevent="moverIndice(-1)"
              @keydown.enter.prevent="alEnter"
              @keydown.esc="cerrarLista"
            >
            <ul v-if="listaAbierta" id="lista-formulas" class="combo-lista" role="listbox">
              <li
                v-for="(f, i) in formulasFiltradas"
                :key="f.CodFormula"
                role="option"
                :aria-selected="i === indiceActivo"
                :class="{ activa: i === indiceActivo }"
                @mousemove="indiceActivo = i"
                @mousedown.prevent="elegirFormula(f); enfocarBachadas()"
              >
                <strong>{{ f.CodFormula }}</strong> — {{ f.Nombre }}
              </li>
              <li v-if="formulasFiltradas.length === 0" class="combo-vacio">Sin resultados</li>
            </ul>
          </div>

          <!-- Fuera del combo -->
          <div class="fieldgrup">
            <div>
              <label for="bachadas">Cantidad de bachadas</label>
              <input id="bachadas" ref="inputBachadas" type="number" min="1" step="1" v-model.number="bachadas">
            </div>

            <div>
              <label class="kgtotal">KG Total:</label>
              <p class="infokg">{{ formatKg(totalKgTotal) }}</p>
            </div>
          </div>
        </div>
        </form>
        <div class="form-submit">
          <button class="btn btn-primary" type="button" :disabled="!codFormula" @click="imprimir" style="width: 100%;">
            Imprimir
          </button>
        </div>
      </div>
    </div>

    <div class="vp">
      <h2 class="card-title vp-title no-print">Vista previa</h2>

      <div v-if="cargando" class="estado no-print">Cargando…</div>

      <!-- Todo lo que está dentro de #impresion-comanda es lo único que se imprime -->
      <div v-else-if="codFormula" class="impresion" id="impresion-comanda">
        <div class="hoja">
          <div class="hoja-header">
            <div class="logo" style="display: flex; justify-content: space-between; align-items: center;">
              <img style="width: 42%;" src="@/assets/logotres.png" alt="LogoPSF" />
              <p class="fecha-orden" style="font-weight: bold;">FECHA: {{ fechaHoy }}</p>
            </div>
            <div class="titulo-parte">
                <p class="orden-produ">ORDEN DE PRODUCCIÓN: {{ numeroOrden }}</p>
              </div>
          </div>

          <div class="encabezado">
            <div class="dato">
              <span class="etiqueta">Producto</span>
              <span class="valor">{{ codFormula }} — {{ nombreFormula }}</span>
            </div>
            <div class="dato">
              <span class="etiqueta">Cantidad</span>
              <span class="valor">{{ bachadas }} bachadas</span>
            </div>
          </div>

          <table class="tabla-materiales">
            <thead>
              <tr>
                <th class="col-cod">Cód.</th>
                <th class="col-material">Material</th>
                <th class="col-kg">Kg x bachada</th>
                <th class="col-kg">Kg total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in filas" :key="f.codArticulo">
                <td class="col-cod">{{ f.codArticulo }}</td>
                <td class="col-material">{{ f.material }}</td>
                <td class="col-kg">{{ formatKg(f.kgPorBachada) }}</td>
                <td class="col-kg">{{ formatKg(f.kgTotal) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">Total</td>
                <td class="col-kg">{{ formatKg(totalKgPorBachada) }}</td>
                <td class="col-kg">{{ formatKg(totalKgTotal) }}</td>
              </tr>
            </tfoot>
          </table>

          <h3 class="subtitulo">Bachadas Producidas</h3>
          <table class="tabla-produccion">
            <thead>
              <tr>
                <th style="width: 30%;">Nombre</th>
                <th style="width: 22%;">Bachadas</th>
                <th style="width: 15%;">KG</th>
                <th>Fecha</th>
                <th>Turno</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="id in filasProduccion" :key="id">
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr style="border: 2px solid #000; height: 5rem; background-color: #f0f0f0;">
                <td id="kgSemiE">KG SEMIELABORADO:</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="estado no-print">Seleccioná una fórmula para armar la comanda.</div>
    </div>
  </div>
</template>

<!-- Estilos de pantalla (mismo sistema de diseño que Parte Diario) -->
<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.comanda-app {
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

.comanda-app * {
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

.card.comanda-form {
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

.field {
  display: block;
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

.form-grid {
  display: grid;
  grid-template-columns: 1fr; /* antes: 2fr 1fr */
  gap: 1.1rem 1.5rem;
}

.fieldgrup {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  width: 100%;
}

/* Cada bloque (bachadas / KG total) reparte el ancho en partes iguales */
.fieldgrup > div {
  flex: 1;
  min-width: 0;
}

/* Labels arriba del input, ocupando su propia línea */
.field label,
.fieldgrup label {
  display: block;
  margin-bottom: 0.35rem;
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

.kgtotal{
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
  margin: 0;
}

.infokg{
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  margin: 0;
  width: 100%; /* antes: 60% */
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
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
  color: var(--surface);
  border-color: var(--accent);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-dark);
  border-color: var(--accent-dark);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--accent-dark);
  border-color: var(--accent-dark);
}

/* Buscador de fórmulas */

.combo {
  position: relative;
}

.combo-lista {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 2px 0 0; /* antes 4px */
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

.form-submit {
  margin-top: 1.25rem;
}

.estado {
  padding: 2rem;
  text-align: center;
  color: var(--accent-dark);
  font-size: 0.9rem;
}

/* Vista previa / hoja */

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
  margin-bottom: 2px;
}


.logo img {
  width: 50%;
  max-width: 250px;
  max-height: 50px;
}

.titulo-parte {
  display: flex;
  margin-left: 2rem;
  gap: 3rem;
}

.orden-produ {
  margin-left: -5%;
  text-align: left;
  font-size: 14px;
  width: 80%;
  margin-top: 1.5%;
  font-weight: bold;
  text-transform: uppercase;
}

.fecha-orden {
  margin-left: 18rem;
  text-align: right;
  font-size: 14px;
  color: #252525;
}

.encabezado {
  display: flex;
  gap: 2.5rem;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
  margin-bottom: 16px;
}

.dato {
  display: flex;
  flex-direction: column;
}

.etiqueta {
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #252525;
}

.valor {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
  text-transform: uppercase;
}

.tabla-materiales,
.tabla-produccion {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 18px;
}

.tabla-materiales th,
.tabla-materiales td,
.tabla-produccion th,
.tabla-produccion td {
  border: 1px solid #000;
  padding: 6px 8px;
  vertical-align: middle;
  text-align: left;
}

.tabla-materiales th,
.tabla-produccion th {
  background-color: #f0f0f0;
  font-size: 12px;
  text-transform: uppercase;
}

#kgSemiE {
  font-weight: bold; 
  border: 0px solid #000;
  padding-bottom: 3rem;
  background-color: #ffffff;
}

.col-cod {
  width: 9%;
  text-align: center !important;
  font-weight: 700;
}

.col-material {
  width: 51%;
}

.col-kg {
  width: 20%;
  text-align: right !important;
}

.tabla-materiales tfoot td {
  font-weight: 700;
  background-color: #f0f0f0;
}

.subtitulo {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 22px 0 10px;
  padding-top: 12px;
  border-top: 2px solid #000;
}

.tabla-produccion td {
  height: 2rem;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .card.comanda-form {
    padding: 1.25rem;
  }

  .pantalla,
  .vp {
    padding: 0 1rem;
  }
}
</style>

<!--
  Estilos de impresión SIN scoped, a propósito:
  con scoped, `body *` solo alcanzaría a los elementos de este componente
  y el menú lateral (que es de otro componente) seguiría imprimiéndose.
-->
<style>
@media print {
  html,
  body {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }

  /* Oculta todo (menú lateral, controles, etc.) ... */
  body * {
    visibility: hidden;
  }

  /* ... menos la hoja de la comanda */
  #impresion-comanda,
  #impresion-comanda * {
    visibility: visible;
  }

  #impresion-comanda {
    position: absolute;
    top: 0;
    left: 0;
    width: 210mm;
  }

  #impresion-comanda .hoja {
    box-shadow: none;
    width: 200mm;
    min-height: 0;
    margin: 0 auto;
  }

  #impresion-comanda th,
  #impresion-comanda tfoot td {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .no-print {
    display: none !important;
  }

  @page {
    size: A4;
    margin: 10mm 0;
  }
}
</style>
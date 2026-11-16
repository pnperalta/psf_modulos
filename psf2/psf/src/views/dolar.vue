<script setup>
import { ref, onMounted } from 'vue'

const precioDolar = ref(0)
const nuevoPrecio = ref(0)
const cargando = ref(true)
const guardando = ref(false)

async function cargarCotizacion() {
  cargando.value = true
  try {
    const res = await fetch('http://localhost:3000/dolar')
    if (!res.ok) throw new Error('Error al obtener la cotización')
    const data = await res.json()
    precioDolar.value = data.precioDolar
    nuevoPrecio.value = data.precioDolar
  } catch (err) {
    console.error(err)
    alert('Hubo un error al cargar la cotización del dólar.')
  } finally {
    cargando.value = false
  }
}

async function guardarCotizacion() {
  if (!nuevoPrecio.value || nuevoPrecio.value <= 0) {
    alert('Ingresá un valor válido para la cotización del dólar.')
    return
  }

  guardando.value = true
  try {
    const res = await fetch('http://localhost:3000/dolar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precioDolar: nuevoPrecio.value })
    })
    if (!res.ok) throw new Error('Error al guardar la cotización')

    const data = await res.json()
    precioDolar.value = data.precioDolar

    } catch (err) {
    console.error(err)
    alert('Hubo un error al guardar la cotización del dólar.')
  } finally {
    guardando.value = false
  }
}

onMounted(cargarCotizacion)
</script>

<template>
  <div class="about">
    <div class="card">
      <h1>Cotización del dólar</h1>

      <p v-if="cargando" class="state-msg">Cargando…</p>

      <template v-else>
        <p class="actual">
          Cotización actual: <strong>${{ Number(precioDolar).toFixed(2) }}</strong>
        </p>

        <form @submit.prevent="guardarCotizacion" class="form">
          <label for="precioDolar">Nuevo precio del dólar (en pesos)</label>
          <input type="number" step="0.01" min="0" id="precioDolar" v-model.number="nuevoPrecio" placeholder="0.00">
          <button type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando…' : 'Guardar cotización' }}
          </button>
        </form>

        <p class="hint">
          Al guardar, se recalcula automáticamente el precio en dólares de todos los insumos según su precio en pesos.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.about {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: #f2efee;
}
.card {
  background: #fff;
  border: 1px solid #ddd6d4;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(34,31,30,.07), 0 10px 30px -14px rgba(34,31,30,.26);
  padding: 2rem 2.25rem;
  max-width: 420px;
  width: 100%;
}
h1 { font-size: 1.5rem; margin: 0 0 1.25rem; color: #221f1e; }
.actual { font-size: 1.05rem; margin-bottom: 1.5rem; color: #221f1e; }
.form { display: flex; flex-direction: column; gap: .6rem; }
label { font-size: .85rem; font-weight: 600; color: #6e6360; }
input { font-size: 1rem; padding: .6rem .75rem; border: 1.5px solid #ddd6d4; border-radius: 8px; }
button { margin-top: .5rem; background: #c1272d; color: #fff; border: none; border-radius: 8px; padding: .7rem 1rem; font-weight: 600; cursor: pointer; }
button:disabled { opacity: .6; cursor: not-allowed; }
.hint { margin-top: 1.25rem; font-size: .85rem; color: #6e6360; }
.state-msg { color: #6e6360; }
</style>
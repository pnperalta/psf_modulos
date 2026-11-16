import express from 'express';
import cors from 'cors';
import pool from './db.js';

const app = express();
app.use(express.json());
app.use(cors());

async function guardarVersionHistorial(codFormula) {
  const [[formula]] = await pool.query('SELECT Nombre FROM formulas WHERE CodFormula = ?', [codFormula]);
  if (!formula) return;
  const [detalle] = await pool.query(
    'SELECT CodArticulo, Cantidad, Unidad FROM formula_insumos WHERE CodFormula = ?',
    [codFormula]
  );
  await pool.query(
    'INSERT INTO formulas_historial (CodFormula, Nombre, Detalle) VALUES (?, ?, ?)',
    [codFormula, formula.Nombre, JSON.stringify(detalle)]
  );
}

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando!');
});

// ==========================================
// MODULOUNO: Obtener TODOS los registros
// ==========================================
app.get('/modulouno', async (_req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM modulouno ORDER BY CodArtPatron, CodArticulo');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener los datos de modulouno' });
    }
});

// ==========================================
// MODULOUNO: Obtener todos los productos de UNA familia
// ==========================================
app.get('/modulouno/familia/:codArtPatron', async (req, res) => {
    try {
        const { codArtPatron } = req.params;
        const [rows] = await pool.query(
            'SELECT * FROM modulouno WHERE CodArtPatron = ? ORDER BY CodArticulo',
            [codArtPatron]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron productos para esa familia' });
        }
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al buscar la familia' });
    }
});

// ==========================================
// MODULOUNO: Obtener UN producto específico
// ==========================================
app.get('/modulouno/:codArtPatron/:codArticulo', async (req, res) => {
    try {
        const { codArtPatron, codArticulo } = req.params;
        const [rows] = await pool.query(
            'SELECT * FROM modulouno WHERE CodArtPatron = ? AND CodArticulo = ?',
            [codArtPatron, codArticulo]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al buscar el producto' });
    }
});

// ==========================================
// MODULOUNO: Crear un nuevo producto (POST)
// ==========================================
app.post('/modulouno', async (req, res) => {
    try {
        const { CodArtPatron, DetalleArtPatron, DetalleArticulo, CodArticulo, Pesos, Dolares } = req.body;

        const querySQL = `
            INSERT INTO modulouno (CodArtPatron, DetalleArtPatron, DetalleArticulo, CodArticulo, Pesos, Dolares)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await pool.query(querySQL, [
            CodArtPatron,
            DetalleArtPatron,
            DetalleArticulo,
            CodArticulo,
            Pesos ?? 0,
            Dolares ?? 0
        ]);

        res.status(201).json({ CodArtPatron, DetalleArtPatron, DetalleArticulo, CodArticulo, Pesos, Dolares });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al insertar el producto (¿ese código ya existe en esa familia?)' });
    }
});

// ==========================================
// MODULOUNO: Actualizar un producto (PUT)
// ==========================================
app.put('/modulouno/:codArtPatron/:codArticulo', async (req, res) => {
    try {
        const { codArtPatron, codArticulo } = req.params;
        const { DetalleArtPatron, DetalleArticulo, Pesos, Dolares } = req.body;

        const querySQL = `
            UPDATE modulouno
            SET DetalleArtPatron = ?, DetalleArticulo = ?, Pesos = ?, Dolares = ?
            WHERE CodArtPatron = ? AND CodArticulo = ?
        `;
        const [resultado] = await pool.query(querySQL, [
            DetalleArtPatron,
            DetalleArticulo,
            Pesos,
            Dolares,
            codArtPatron,
            codArticulo
        ]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado para actualizar' });
        }
        res.json({ mensaje: 'Producto actualizado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el producto' });
    }
});

// ==========================================
// MODULOUNO: Eliminar un producto (DELETE)
// ==========================================
app.delete('/modulouno/:codArtPatron/:codArticulo', async (req, res) => {
    try {
        const { codArtPatron, codArticulo } = req.params;
        const [resultado] = await pool.query(
            'DELETE FROM modulouno WHERE CodArtPatron = ? AND CodArticulo = ?',
            [codArtPatron, codArticulo]
        );
        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'No se encontró el producto para eliminar' });
        }
        res.json({ mensaje: `Producto ${codArticulo} de la familia ${codArtPatron} eliminado` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el producto' });
    }
});

// ==========================================
// COTIZACION: Obtener el precio del dólar actual
// ==========================================
app.get('/dolar', async (_req, res) => {
    try {
        const [rows] = await pool.query('SELECT precioDolar, actualizado FROM cotizacion WHERE id = 1');
        if (rows.length === 0) {
            return res.json({ precioDolar: 0, actualizado: null });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la cotización del dólar' });
    }
});

// ==========================================
// COTIZACION: Actualizar el precio del dólar
// y recalcular los dólares de todos los insumos
// ==========================================
app.put('/dolar', async (req, res) => {
    const { precioDolar } = req.body;

    if (precioDolar === undefined || precioDolar === null || isNaN(precioDolar) || precioDolar <= 0) {
        return res.status(400).json({ error: 'precioDolar inválido' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(
            `INSERT INTO cotizacion (id, precioDolar) VALUES (1, ?)
             ON DUPLICATE KEY UPDATE precioDolar = ?`,
            [precioDolar, precioDolar]
        );

        // Recalcula el precio en dólares de TODOS los insumos según el nuevo tipo de cambio
        // (el precio en pesos queda como está, es la base)
        const [resultado] = await conn.query(
            'UPDATE modulouno SET Dolares = ROUND(Pesos / ?, 2)',
            [precioDolar]
        );

        await conn.commit();

        const [rows] = await conn.query('SELECT precioDolar, actualizado FROM cotizacion WHERE id = 1');
        res.json({ ...rows[0], filasActualizadas: resultado.affectedRows });
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar la cotización del dólar' });
    } finally {
        conn.release();
    }
});

// ==========================================
// FORMULAS: Listar todas las fórmulas (código + nombre)
// ==========================================
app.get('/formulas', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT CodFormula, Nombre, FechaCreacion, FechaModificacion FROM formulas ORDER BY CodFormula'
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener las fórmulas' });
    }
});

// ==========================================
// FORMULAS: Crear una fórmula nueva (código + nombre)
// ==========================================
app.post('/formulas', async (req, res) => {
    try {
        const { CodFormula, Nombre } = req.body;
        if (!CodFormula || !Nombre) {
            return res.status(400).json({ error: 'CodFormula y Nombre son obligatorios' });
        }
        await pool.query('INSERT INTO formulas (CodFormula, Nombre) VALUES (?, ?)', [CodFormula, Nombre]);
        res.status(201).json({ CodFormula, Nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear la fórmula (¿ese código ya existe?)' });
    }
});

// ==========================================
// FORMULAS: Editar el nombre de una fórmula
// ==========================================
app.put('/formulas/:codFormula', async (req, res) => {
    try {
        const { codFormula } = req.params;
        const { Nombre } = req.body;
        if (!Nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });

        await guardarVersionHistorial(codFormula); // 👈 foto antes de cambiar el nombre

        const [resultado] = await pool.query(
            'UPDATE formulas SET Nombre = ? WHERE CodFormula = ?',
            [Nombre, codFormula]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ error: 'Fórmula no encontrada' });
        res.json({ CodFormula: codFormula, Nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar la fórmula' });
    }
});

// ==========================================
// FORMULAS: Eliminar una fórmula completa
// (borra también todas las cantidades cargadas en formula_insumos)
// ==========================================
app.delete('/formulas/:codFormula', async (req, res) => {
    const { codFormula } = req.params;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM formula_insumos WHERE CodFormula = ?', [codFormula]);
        const [resultado] = await conn.query('DELETE FROM formulas WHERE CodFormula = ?', [codFormula]);
        await conn.commit();

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Fórmula no encontrada' });
        }
        res.json({ mensaje: `Fórmula ${codFormula} eliminada` });
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la fórmula' });
    } finally {
        conn.release();
    }
});

// ==========================================
// FORMULAS: Detalle plano de TODAS las cantidades cargadas
// (para armar la matriz insumos x fórmulas de una sola vez)
// ==========================================
app.get('/formulas/detalle', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT CodFormula, CodArticulo, Cantidad, Unidad FROM formula_insumos'
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el detalle de fórmulas' });
    }
});

// ==========================================
// FORMULAS: Guardar cantidad (kg) de un insumo dentro de una fórmula (upsert)
// ==========================================
app.put('/formulas/:codFormula/:codArticulo', async (req, res) => {
    try {
        const { codFormula, codArticulo } = req.params;
        const { Cantidad, Unidad } = req.body;
        if (Cantidad === undefined || Cantidad === null || isNaN(Cantidad)) {
            return res.status(400).json({ error: 'Cantidad inválida' });
        }
        const unidadFinal = Unidad === 'gramos' ? 'gramos' : 'kg';

        await guardarVersionHistorial(codFormula); // 👈 foto antes de cambiar la celda

        await pool.query(
            `INSERT INTO formula_insumos (CodFormula, CodArticulo, Cantidad, Unidad)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE Cantidad = VALUES(Cantidad), Unidad = VALUES(Unidad)`,
            [codFormula, codArticulo, Cantidad, unidadFinal]
        );

        await pool.query('UPDATE formulas SET FechaModificacion = NOW() WHERE CodFormula = ?', [codFormula]); // 👈 toca la fecha a mano

        res.json({ CodFormula: codFormula, CodArticulo: codArticulo, Cantidad, Unidad: unidadFinal });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar la cantidad' });
    }
});

// ==========================================
// FORMULAS: Quitar un insumo de una fórmula (vaciar celda)
// ==========================================
app.delete('/formulas/:codFormula/:codArticulo', async (req, res) => {
    try {
        const { codFormula, codArticulo } = req.params;

        await guardarVersionHistorial(codFormula); // 👈 foto antes de borrar

        await pool.query('DELETE FROM formula_insumos WHERE CodFormula = ? AND CodArticulo = ?', [codFormula, codArticulo]);
        await pool.query('UPDATE formulas SET FechaModificacion = NOW() WHERE CodFormula = ?', [codFormula]); // 👈

        res.json({ mensaje: `Insumo ${codArticulo} eliminado de la fórmula ${codFormula}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el insumo de la fórmula' });
    }
});

app.get('/formulas/:codFormula/historial', async (req, res) => {
    try {
        const { codFormula } = req.params;
        const [rows] = await pool.query(
            'SELECT HistorialId, Nombre, Detalle, FechaVersion FROM formulas_historial WHERE CodFormula = ? ORDER BY FechaVersion DESC',
            [codFormula]
        );
        const historial = rows.map(r => ({
            ...r,
            Detalle: typeof r.Detalle === 'string' ? JSON.parse(r.Detalle) : r.Detalle
        }));
        res.json(historial);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el historial' });
    }
});

// ============================================================
// ADICIONES PARA index.js — Módulo "Parte Diario"
// ============================================================
// Cómo instalar:
//   1) npm install multer   (si todavía no lo tenés instalado)
//   2) Correr el archivo partes_diarios.sql en tu base de datos
//   3) Correr también: ALTER TABLE maquinas ADD COLUMN Multiplicador
//      DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER Nombre;
//      (esto define cuántas veces se multiplica cada bachada según la máquina)
//   4) Pegar el bloque de imports (abajo) junto a los imports existentes de index.js
//   5) Pegar el resto de las rutas junto a las demás rutas de index.js
//      (por ejemplo, justo antes de app.listen(...))
// ============================================================

// --- Imports a agregar arriba del archivo, junto a los que ya tenés ---
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Configuración de la carpeta donde se guardan los PDF de los partes ---
// Por defecto se crea "partes_diarios" al lado de index.js.
// Si preferís guardarlo en otra ubicación (por ejemplo un disco compartido),
// cambiá esta línea por una ruta absoluta, ej:
//   const CARPETA_PARTES = 'C:\\PSF\\partes_diarios';
const CARPETA_PARTES = path.join(os.homedir(), 'Documents', 'PartesDiarios');
if (!fs.existsSync(CARPETA_PARTES)) fs.mkdirSync(CARPETA_PARTES, { recursive: true });

const CARPETA_TEMP = path.join(process.cwd(), 'tmp_uploads');
if (!fs.existsSync(CARPETA_TEMP)) fs.mkdirSync(CARPETA_TEMP, { recursive: true });
const uploadPdf = multer({ dest: CARPETA_TEMP });


app.get('/maquinas', async (_req, res) => {
    try {
        const [rows] = await pool.query('SELECT Id, Nombre FROM maquinas ORDER BY Nombre');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener las máquinas' });
    }
});

app.post('/maquinas', async (req, res) => {
    try {
        const { Nombre } = req.body;
        if (!Nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });
        const [resultado] = await pool.query('INSERT INTO maquinas (Nombre) VALUES (?)', [Nombre]);
        res.status(201).json({ Id: resultado.insertId, Nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear la máquina (¿ya existe?)' });
    }
});

app.put('/maquinas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Nombre } = req.body;
        if (!Nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });
        const [resultado] = await pool.query('UPDATE maquinas SET Nombre = ? WHERE Id = ?', [Nombre, id]);
        if (resultado.affectedRows === 0) return res.status(404).json({ error: 'Máquina no encontrada' });
        res.json({ Id: Number(id), Nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar la máquina' });
    }
});

// ==========================================
// MAQUINAS: Eliminar
// ==========================================
app.delete('/maquinas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [resultado] = await pool.query('DELETE FROM maquinas WHERE Id = ?', [id]);
        if (resultado.affectedRows === 0) return res.status(404).json({ error: 'Máquina no encontrada' });
        res.json({ mensaje: 'Máquina eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la máquina' });
    }
});

// ==========================================
// FORMULAS: Detalle crudo de UNA fórmula (CodArticulo, Cantidad, Unidad)
// Lo usa Parte Diario para armar el texto de la tarea aplicando el
// multiplicador de bachadas. Los nombres de los insumos y su orden
// (igual que en la matriz de Fórmulas) se resuelven en el front con /modulouno.
// ==========================================
app.get('/formulas/:codFormula/detalle', async (req, res) => {
    try {
        const { codFormula } = req.params;
        const [[formula]] = await pool.query(
            'SELECT CodFormula, Nombre FROM formulas WHERE CodFormula = ?',
            [codFormula]
        );
        if (!formula) return res.status(404).json({ error: 'Fórmula no encontrada' });

        const [insumos] = await pool.query(
            'SELECT CodArticulo, Cantidad, Unidad FROM formula_insumos WHERE CodFormula = ?',
            [codFormula]
        );

        res.json({ CodFormula: formula.CodFormula, Nombre: formula.Nombre, insumos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el detalle de la fórmula' });
    }
});

// ==========================================
// PARTES DIARIOS: Guardar backup (JSON) de un parte ya generado
// (misma idea que /comandas/backup: queda un registro en la base
// de cada parte que se imprimió, con el detalle ya calculado)
// ==========================================
app.post('/partes/backup', async (req, res) => {
    try {
        const { maquina, observaciones, fecha, items } = req.body;
        const [resultado] = await pool.query(
            'INSERT INTO partes_diarios (Maquina, Observaciones, Fecha, Detalle) VALUES (?, ?, ?, ?)',
            [maquina || null, observaciones || null, fecha || null, JSON.stringify(items || [])]
        );
        res.status(201).json({ mensaje: 'Parte diario guardado', numero: resultado.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar el backup del parte diario' });
    }
});

// Mira los PDF que ya hay en la carpeta y calcula el próximo número,
// leyendo el número al principio del nombre del archivo (ej: "0007 - ...").
function proximoNumeroParte() {
    if (!fs.existsSync(CARPETA_PARTES)) fs.mkdirSync(CARPETA_PARTES, { recursive: true });
    const archivos = fs.readdirSync(CARPETA_PARTES).filter(f => f.toLowerCase().endsWith('.pdf'));

    let maximo = 0;
    for (const archivo of archivos) {
        const match = archivo.match(/^(\d+)/);
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maximo) maximo = n;
        }
    }
    return maximo + 1;
}

app.post('/partes/backup-pdf', uploadPdf.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió el PDF' });

        const numero = req.body.numero ? parseInt(req.body.numero, 10) : proximoNumeroParte();
        const numeroFormateado = String(numero).padStart(4, '0');

        const nombreOriginalSeguro = (req.file.originalname || `parte-${Date.now()}.pdf`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
        const nombreFinal = `${numeroFormateado} - ${nombreOriginalSeguro}`;

        const destino = path.join(CARPETA_PARTES, nombreFinal);
        fs.renameSync(req.file.path, destino);

        res.json({ mensaje: 'PDF guardado', numero, archivo: nombreFinal, carpeta: CARPETA_PARTES });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar el PDF del parte diario' });
    }
});

// Junto a CARPETA_PARTES
const CARPETA_COMANDAS = path.join(os.homedir(), 'Documents', 'Comandas');
if (!fs.existsSync(CARPETA_COMANDAS)) fs.mkdirSync(CARPETA_COMANDAS, { recursive: true });

app.post('/comandas/backup-pdf', uploadPdf.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió el PDF' });

        const numero = String(parseInt(req.body.numero, 10) || 0).padStart(4, '0');
        const nombreSeguro = (req.file.originalname || `comanda-${Date.now()}.pdf`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
        const nombreFinal = `${numero} - ${nombreSeguro}`;

        fs.renameSync(req.file.path, path.join(CARPETA_COMANDAS, nombreFinal));

        res.json({ mensaje: 'PDF guardado', archivo: nombreFinal, carpeta: CARPETA_COMANDAS });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar el PDF de la comanda' });
    }
});

// Carpeta donde se guardan los Excel exportados de Fórmulas.
// Cambiá la ruta si querés otra, ej: 'C:\\PSF\\ExcelFormulas'
const CARPETA_EXCEL = path.join(os.homedir(), 'Documents', 'FormulasExcel');

app.post('/formulas/exportar-excel', uploadPdf.single('excel'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió el archivo' });

        // Si la carpeta no existe, la crea
        if (!fs.existsSync(CARPETA_EXCEL)) fs.mkdirSync(CARPETA_EXCEL, { recursive: true });

        const nombreSeguro = (req.file.originalname || `formulas-${Date.now()}.xlsx`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');

        // Si ya existe uno con ese nombre, agrega (2), (3)... para no pisarlo
        const { name, ext } = path.parse(nombreSeguro);
        let nombreFinal = nombreSeguro;
        let n = 2;
        while (fs.existsSync(path.join(CARPETA_EXCEL, nombreFinal))) {
            nombreFinal = `${name} (${n})${ext}`;
            n++;
        }

        const destino = path.join(CARPETA_EXCEL, nombreFinal);
        // copy + unlink en vez de rename, por si la carpeta temporal está en otro disco
        fs.copyFileSync(req.file.path, destino);
        fs.unlinkSync(req.file.path);

        res.json({ mensaje: 'Excel guardado', archivo: nombreFinal, carpeta: CARPETA_EXCEL });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar el Excel' });
    }
});

// ============================================================
// PEGAR EN index.js, antes de app.listen(...)
// ============================================================

async function guardarVersionHistorialPT(codProducto) {
    const [[prod]] = await pool.query('SELECT Nombre FROM productos_terminados WHERE CodProducto = ?', [codProducto]);
    if (!prod) return;
    const [detalle] = await pool.query(
        'SELECT Tipo, CodComponente, Porcentaje FROM producto_componentes WHERE CodProducto = ?',
        [codProducto]
    );
    await pool.query(
        'INSERT INTO productos_terminados_historial (CodProducto, Nombre, Detalle) VALUES (?, ?, ?)',
        [codProducto, prod.Nombre, JSON.stringify(detalle)]
    );
}

// Listar productos terminados
app.get('/productos-terminados', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT CodProducto, Nombre, FechaCreacion, FechaModificacion FROM productos_terminados ORDER BY CodProducto'
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener los productos terminados' });
    }
});

// Detalle plano de TODAS las composiciones (para armar la matriz)
app.get('/productos-terminados/detalle', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT CodProducto, Tipo, CodComponente, Porcentaje FROM producto_componentes'
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el detalle de productos terminados' });
    }
});

// Crear
app.post('/productos-terminados', async (req, res) => {
    try {
        const { CodProducto, Nombre } = req.body;
        if (!CodProducto || !Nombre) {
            return res.status(400).json({ error: 'CodProducto y Nombre son obligatorios' });
        }
        await pool.query('INSERT INTO productos_terminados (CodProducto, Nombre) VALUES (?, ?)', [CodProducto, Nombre]);
        const [[creado]] = await pool.query(
            'SELECT CodProducto, Nombre, FechaCreacion, FechaModificacion FROM productos_terminados WHERE CodProducto = ?',
            [CodProducto]
        );
        res.status(201).json(creado);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear el producto (¿ese código ya existe?)' });
    }
});

// Editar nombre
app.put('/productos-terminados/:codProducto', async (req, res) => {
    try {
        const { codProducto } = req.params;
        const { Nombre } = req.body;
        if (!Nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });

        await guardarVersionHistorialPT(codProducto);

        const [resultado] = await pool.query(
            'UPDATE productos_terminados SET Nombre = ? WHERE CodProducto = ?',
            [Nombre, codProducto]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ CodProducto: codProducto, Nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el producto' });
    }
});

// Eliminar producto (y su composición)
app.delete('/productos-terminados/:codProducto', async (req, res) => {
    const { codProducto } = req.params;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM producto_componentes WHERE CodProducto = ?', [codProducto]);
        const [resultado] = await conn.query('DELETE FROM productos_terminados WHERE CodProducto = ?', [codProducto]);
        await conn.commit();
        if (resultado.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ mensaje: `Producto ${codProducto} eliminado` });
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el producto' });
    } finally {
        conn.release();
    }
});

// Guardar porcentaje de un componente (upsert) — valida que el total no pase de 100
app.put('/productos-terminados/:codProducto/:tipo/:codComponente', async (req, res) => {
    try {
        const { codProducto, tipo, codComponente } = req.params;
        const porcentaje = Number(req.body.Porcentaje);

        if (!['formula', 'insumo'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
        if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
            return res.status(400).json({ error: 'Porcentaje inválido' });
        }

        const [[otros]] = await pool.query(
            `SELECT COALESCE(SUM(Porcentaje), 0) AS suma
             FROM producto_componentes
             WHERE CodProducto = ? AND NOT (Tipo = ? AND CodComponente = ?)`,
            [codProducto, tipo, codComponente]
        );
        if (Number(otros.suma) + porcentaje > 100.0001) {
            return res.status(400).json({ error: 'La composición no puede superar el 100%' });
        }

        await guardarVersionHistorialPT(codProducto);

        await pool.query(
            `INSERT INTO producto_componentes (CodProducto, Tipo, CodComponente, Porcentaje)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE Porcentaje = VALUES(Porcentaje)`,
            [codProducto, tipo, codComponente, porcentaje]
        );
        await pool.query('UPDATE productos_terminados SET FechaModificacion = NOW() WHERE CodProducto = ?', [codProducto]);

        res.json({ CodProducto: codProducto, Tipo: tipo, CodComponente: codComponente, Porcentaje: porcentaje });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar el porcentaje' });
    }
});

// Quitar un componente (vaciar celda)
app.delete('/productos-terminados/:codProducto/:tipo/:codComponente', async (req, res) => {
    try {
        const { codProducto, tipo, codComponente } = req.params;
        await guardarVersionHistorialPT(codProducto);
        await pool.query(
            'DELETE FROM producto_componentes WHERE CodProducto = ? AND Tipo = ? AND CodComponente = ?',
            [codProducto, tipo, codComponente]
        );
        await pool.query('UPDATE productos_terminados SET FechaModificacion = NOW() WHERE CodProducto = ?', [codProducto]);
        res.json({ mensaje: 'Componente eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el componente' });
    }
});

// Historial
app.get('/productos-terminados/:codProducto/historial', async (req, res) => {
    try {
        const { codProducto } = req.params;
        const [rows] = await pool.query(
            'SELECT HistorialId, Nombre, Detalle, FechaVersion FROM productos_terminados_historial WHERE CodProducto = ? ORDER BY FechaVersion DESC, HistorialId DESC',
            [codProducto]
        );
        res.json(rows.map(r => ({
            ...r,
            Detalle: typeof r.Detalle === 'string' ? JSON.parse(r.Detalle) : r.Detalle
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el historial' });
    }
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
const express = require('express');
const pool = require('./db.cjs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Mapeo de colecciones localStorage → tablas MySQL + columnas
const TABLE_MAP = {
    clients: {
        table: 'clientes',
        cols: {
            id: 'id',
            nombreCompleto: 'nombre_completo',
            apellidosCompletos: 'apellidos_completos',
            dni: 'dni',
            fechaNacimiento: 'fecha_nacimiento',
            telefono1: 'telefono1',
            telefono2: 'telefono2',
            email1: 'email1',
            email2: 'email2',
            dniFrontal: 'dni_frontal',
            dniPosterior: 'dni_posterior',
        }
    },
    banks: {
        table: 'bancos',
        cols: {
            id: 'id',
            nombre: 'nombre',
        }
    },
    insurances: {
        table: 'seguros',
        cols: {
            id: 'id',
            nombre: 'nombre',
            descripcion: 'descripcion',
            bancoId: 'banco_id',
            poliza: 'poliza',
        }
    },
    coverages: {
        table: 'coberturas',
        cols: {
            id: 'id',
            seguroId: 'seguro_id',
            nombre: 'nombre',
            descripcion: 'descripcion',
            monto: 'monto',
        }
    },
    bankAccounts: {
        table: 'cuentas_bancarias',
        cols: {
            id: 'id',
            clienteId: 'cliente_id',
            bancoId: 'banco_id',
            moneda: 'moneda',
            numeroCuenta: 'numero_cuenta',
        }
    },
    cards: {
        table: 'tarjetas',
        cols: {
            id: 'id',
            clienteId: 'cliente_id',
            bancoId: 'banco_id',
            seguroId: 'seguro_id',
            numero: 'numero',
            numeroCuenta: 'numero_cuenta',
            moneda: 'moneda',
            comentario: 'comentario',
            activo: 'activo',
        }
    },
    incidents: {
        table: 'siniestros',
        cols: {
            id: 'id',
            clienteId: 'cliente_id',
            fecha: 'fecha',
            denunciaDescripcion: 'denuncia_descripcion',
            denunciaArchivo: 'denuncia_archivo',
            denunciaFormato: 'denuncia_formato',
        }
    },
    claims: {
        table: 'reclamos',
        cols: {
            id: 'id',
            siniestroId: 'siniestro_id',
            bancoId: 'banco_id',
            fecha: 'fecha',
            observaciones: 'observaciones',
            evidencia: 'evidencia',
            montoTotal: 'monto_total',
            estado: 'estado',
        }
    },
    claimDetails: {
        table: 'detalle_reclamos',
        cols: {
            id: 'id',
            reclamoId: 'reclamo_id',
            coberturaId: 'cobertura_id',
            monto: 'monto',
            moneda: 'moneda',
            tipoCambio: 'tipo_cambio',
            montoSoles: 'monto_soles',
            evidencia: 'evidencia',
        }
    },
    claimEvents: {
        table: 'eventos_reclamo',
        cols: {
            id: 'id',
            reclamoId: 'reclamo_id',
            fecha: 'fecha',
            fechaRegistro: 'fecha_registro',
            descripcion: 'descripcion',
            observacion: 'observacion',
            evidencia: 'evidencia',
            diasEspera: 'dias_espera',
            tipoDias: 'tipo_dias',
            fechaVencimiento: 'fecha_vencimiento',
            eventoOrigenId: 'evento_origen_id',
        }
    },
    roles: {
        table: 'roles',
        cols: {
            id: 'id',
            nombre: 'nombre',
            descripcion: 'descripcion',
        }
    },
    users: {
        table: 'usuarios',
        cols: {
            id: 'id',
            usuario: 'usuario',
            clave: 'clave',
            nombreCompleto: 'nombre_completo',
            rolId: 'rol_id',
            activo: 'activo',
        }
    },
    rolePermissions: {
        table: 'permisos_rol',
        cols: {
            id: 'id',
            rolId: 'rol_id',
            pantalla: 'pantalla',
            acceso: 'acceso',
        }
    },
};

// Helpers: convertir entre camelCase (JS) y snake_case (MySQL)
function toDbRow(entity, cols) {
    const row = {};
    for (const [jsKey, dbCol] of Object.entries(cols)) {
        if (entity[jsKey] !== undefined) {
            row[dbCol] = entity[jsKey];
        }
    }
    return row;
}

function toJsEntity(row, cols) {
    const entity = {};
    const reverse = {};
    for (const [jsKey, dbCol] of Object.entries(cols)) {
        reverse[dbCol] = jsKey;
    }
    for (const [dbCol, value] of Object.entries(row)) {
        const jsKey = reverse[dbCol];
        if (jsKey) {
            // Convertir fechas a ISO string
            if (value instanceof Date) {
                entity[jsKey] = value.toISOString();
            } else if (dbCol === 'activo') {
                entity[jsKey] = value === 1 || value === true;
            } else {
                entity[jsKey] = value;
            }
        }
    }
    return entity;
}

// Manejar cuentaIds de tarjetas (relación N:M)
async function getCardCuentaIds(cardId) {
    const [rows] = await pool.execute(
        'SELECT cuenta_id FROM tarjetas_cuentas WHERE tarjeta_id = ?', [cardId]
    );
    return rows.map(r => r.cuenta_id);
}

async function setCardCuentaIds(cardId, cuentaIds) {
    await pool.execute('DELETE FROM tarjetas_cuentas WHERE tarjeta_id = ?', [cardId]);
    for (const cuentaId of (cuentaIds || [])) {
        await pool.execute(
            'INSERT INTO tarjetas_cuentas (tarjeta_id, cuenta_id) VALUES (?, ?)',
            [cardId, cuentaId]
        );
    }
}

// ============================================================
// GET /api/:collection - Obtener todos los registros
// ============================================================
router.get('/:collection', async (req, res) => {
    const mapping = TABLE_MAP[req.params.collection];
    if (!mapping) return res.status(404).json({ error: 'Colección no encontrada' });

    try {
        const [rows] = await pool.execute(`SELECT * FROM ${mapping.table}`);
        const entities = rows.map(row => toJsEntity(row, mapping.cols));

        // Para tarjetas, agregar cuentaIds
        if (req.params.collection === 'cards') {
            for (const entity of entities) {
                entity.cuentaIds = await getCardCuentaIds(entity.id);
            }
        }

        res.json(entities);
    } catch (err) {
        console.error('GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// GET /api/:collection/:id - Obtener un registro por ID
// ============================================================
router.get('/:collection/:id', async (req, res) => {
    const mapping = TABLE_MAP[req.params.collection];
    if (!mapping) return res.status(404).json({ error: 'Colección no encontrada' });

    try {
        const [rows] = await pool.execute(
            `SELECT * FROM ${mapping.table} WHERE id = ?`, [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json(null);

        const entity = toJsEntity(rows[0], mapping.cols);
        if (req.params.collection === 'cards') {
            entity.cuentaIds = await getCardCuentaIds(entity.id);
        }
        res.json(entity);
    } catch (err) {
        console.error('GET by ID error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// POST /api/:collection - Crear un registro
// ============================================================
router.post('/:collection', async (req, res) => {
    const mapping = TABLE_MAP[req.params.collection];
    if (!mapping) return res.status(404).json({ error: 'Colección no encontrada' });

    try {
        const entity = req.body;
        const id = entity.id || uuidv4();
        entity.id = id;

        const dbRow = toDbRow(entity, mapping.cols);
        // Convertir booleano activo a 1/0
        if ('activo' in dbRow) {
            dbRow.activo = dbRow.activo ? 1 : 0;
        }

        const columns = Object.keys(dbRow);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(c => dbRow[c] === undefined ? null : dbRow[c]);

        await pool.execute(
            `INSERT INTO ${mapping.table} (${columns.join(', ')}) VALUES (${placeholders})`,
            values
        );

        // Manejar cuentaIds para tarjetas
        if (req.params.collection === 'cards' && entity.cuentaIds) {
            await setCardCuentaIds(id, entity.cuentaIds);
        }

        // Devolver la entidad con el id generado
        const responseEntity = { ...entity, id };
        res.status(201).json(responseEntity);
    } catch (err) {
        console.error('POST error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// PUT /api/:collection/:id - Actualizar un registro
// ============================================================
router.put('/:collection/:id', async (req, res) => {
    const mapping = TABLE_MAP[req.params.collection];
    if (!mapping) return res.status(404).json({ error: 'Colección no encontrada' });

    try {
        const entity = req.body;
        const dbRow = toDbRow(entity, mapping.cols);
        delete dbRow.id; // No actualizar el ID

        if ('activo' in dbRow) {
            dbRow.activo = dbRow.activo ? 1 : 0;
        }

        const setClauses = Object.keys(dbRow).map(c => `${c} = ?`).join(', ');
        const values = [...Object.values(dbRow).map(v => v === undefined ? null : v), req.params.id];

        if (setClauses) {
            await pool.execute(
                `UPDATE ${mapping.table} SET ${setClauses} WHERE id = ?`,
                values
            );
        }

        // Manejar cuentaIds para tarjetas
        if (req.params.collection === 'cards' && entity.cuentaIds) {
            await setCardCuentaIds(req.params.id, entity.cuentaIds);
        }

        // Devolver entidad actualizada
        const [rows] = await pool.execute(
            `SELECT * FROM ${mapping.table} WHERE id = ?`, [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

        const result = toJsEntity(rows[0], mapping.cols);
        if (req.params.collection === 'cards') {
            result.cuentaIds = await getCardCuentaIds(result.id);
        }
        res.json(result);
    } catch (err) {
        console.error('PUT error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// DELETE /api/:collection/:id - Eliminar un registro
// ============================================================
router.delete('/:collection/:id', async (req, res) => {
    const mapping = TABLE_MAP[req.params.collection];
    if (!mapping) return res.status(404).json({ error: 'Colección no encontrada' });

    try {
        // Para tarjetas, limpiar relación N:M primero
        if (req.params.collection === 'cards') {
            await pool.execute('DELETE FROM tarjetas_cuentas WHERE tarjeta_id = ?', [req.params.id]);
        }

        await pool.execute(
            `DELETE FROM ${mapping.table} WHERE id = ?`, [req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

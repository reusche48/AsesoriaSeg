const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const pool = require('./database/db.cjs');
const apiRouter = require('./database/api.cjs');

const app = express();
const PORT = 3000;

// Carpeta de uploads local
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: guarda archivos en /uploads con nombre único
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, uuidv4() + ext);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================
// Rutas api.php — réplica local de las acciones especiales PHP
// ============================================================
app.all('/api.php', upload.single('file'), async (req, res) => {
    const action = req.query.action;

    // --- LOGIN ---
    if (action === 'login') {
        const { usuario, clave } = req.body;
        if (!usuario || !clave) return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });

        try {
            const [rows] = await pool.execute(
                'SELECT u.*, r.nombre AS rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.usuario = ? AND u.activo = 1',
                [usuario]
            );
            if (rows.length === 0) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

            const user = rows[0];
            const claveDb = user.clave || '';

            // Verificar bcrypt o texto plano (migración automática)
            let valid = false;
            if (claveDb.startsWith('$2')) {
                // PHP usa $2y$, Node usa $2b$ — son compatibles, normalizar prefijo
                const normalizedHash = claveDb.replace(/^\$2y\$/, '$2b$');
                valid = await bcrypt.compare(clave, normalizedHash);
            } else {
                valid = (clave === claveDb);
                if (valid) {
                    // Migrar a bcrypt
                    const hash = await bcrypt.hash(clave, 10);
                    await pool.execute('UPDATE usuarios SET clave = ? WHERE id = ?', [hash, user.id]);
                }
            }

            if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

            // Obtener permisos del rol
            const [permisos] = await pool.execute(
                'SELECT pantalla FROM permisos_rol WHERE rol_id = ? AND acceso = 1',
                [user.rol_id]
            );

            return res.json({
                success: true,
                user: {
                    id: user.id,
                    usuario: user.usuario,
                    nombreCompleto: user.nombre_completo,
                    rolId: user.rol_id,
                    rolNombre: user.rol_nombre,
                },
                permisos: permisos.map(p => p.pantalla),
            });
        } catch (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }

    // --- CHANGE PASSWORD ---
    if (action === 'changePassword') {
        const { userId, currentPassword, newPassword } = req.body;
        if (!userId || !currentPassword || !newPassword)
            return res.status(400).json({ error: 'Datos incompletos.' });

        try {
            const [rows] = await pool.execute('SELECT * FROM usuarios WHERE id = ?', [userId]);
            if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

            const user = rows[0];
            const claveDb = user.clave || '';
            let valid = false;
            if (claveDb.startsWith('$2')) {
                const normalizedHash = claveDb.replace(/^\$2y\$/, '$2b$');
                valid = await bcrypt.compare(currentPassword, normalizedHash);
            } else {
                valid = (currentPassword === claveDb);
            }

            if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });

            const hash = await bcrypt.hash(newPassword, 10);
            await pool.execute('UPDATE usuarios SET clave = ? WHERE id = ?', [hash, userId]);
            return res.json({ success: true });
        } catch (err) {
            console.error('changePassword error:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }

    // --- RESET PASSWORD ---
    if (action === 'resetPassword') {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId requerido.' });

        try {
            const hash = await bcrypt.hash('4321', 10);
            await pool.execute('UPDATE usuarios SET clave = ? WHERE id = ?', [hash, userId]);
            return res.json({ success: true });
        } catch (err) {
            console.error('resetPassword error:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }

    // --- UPLOAD ---
    if (action === 'upload') {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
        return res.json({ url: 'uploads/' + req.file.filename });
    }

    // --- ACTIVITY LOG ---
    if (action === 'activity') {
        const { desde, hasta } = req.query;
        if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde/hasta requeridos.' });

        try {
            const tablesWithAudit = [
                'clientes', 'bancos', 'seguros', 'coberturas', 'tarjetas',
                'cuentas_bancarias', 'siniestros', 'reclamos', 'detalle_reclamos',
                'eventos_reclamo', 'adelantos', 'usuarios', 'roles',
            ];
            const results = [];
            for (const table of tablesWithAudit) {
                try {
                    const [rows] = await pool.execute(
                        `SELECT 'CREAR' AS accion, '${table}' AS entidad,
                                COALESCE(creado_por, '') AS usuario,
                                COALESCE(equipo, '') AS equipo,
                                fecha_creacion AS fecha
                         FROM ${table}
                         WHERE DATE(fecha_creacion) BETWEEN ? AND ?
                         UNION ALL
                         SELECT 'MODIFICAR', '${table}',
                                COALESCE(modificado_por, ''), COALESCE(equipo, ''), fecha_modificacion
                         FROM ${table}
                         WHERE fecha_modificacion IS NOT NULL AND DATE(fecha_modificacion) BETWEEN ? AND ?`,
                        [desde, hasta, desde, hasta]
                    );
                    results.push(...rows);
                } catch (e) { /* tabla sin auditoría, ignorar */ }
            }
            results.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            return res.json(results);
        } catch (err) {
            console.error('Activity error:', err);
            return res.status(500).json({ error: 'Error al consultar actividad.' });
        }
    }

    return res.status(400).json({ error: `Acción desconocida: ${action}` });
});

// ============================================================
// CRUD REST — /api/:collection
// ============================================================
app.use('/api', (req, res, next) => {
    console.log(`[API] ${req.method} ${req.originalUrl}`);
    next();
});
app.use('/api', apiRouter);

// Archivos estáticos (frontend + uploads)
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname), {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    },
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\nServidor local corriendo en http://localhost:${PORT}`);
    console.log(`Conectado a BD: ${require('./database/db.cjs').pool?.config?.connectionConfig?.host || '107.180.115.202'}`);
    console.log(`\nPresiona Ctrl+C para detener.\n`);
});

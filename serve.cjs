const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./database/api.cjs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Log de peticiones API
app.use('/api', (req, res, next) => {
    console.log(`[API] ${req.method} ${req.originalUrl}`);
    next();
});

// API REST
app.use('/api', apiRouter);

// Archivos estáticos (frontend) - sin caché para desarrollo
app.use(express.static(path.join(__dirname), {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        // Deshabilitar caché para desarrollo
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    }
}));

// Fallback a index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`API disponible en http://localhost:${PORT}/api`);
});

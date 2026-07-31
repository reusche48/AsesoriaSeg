<?php
/**
 * API REST para Sistema de Asesoría de Seguros
 * Endpoint único que maneja todas las colecciones CRUD
 * 
 * URL: /api.php?collection=clients
 * URL: /api.php?collection=clients&id=xxx
 */

header('Content-Type: application/json; charset=utf-8');

// CORS restringido a los dominios propios (evita lectura cross-origin por terceros)
$allowedOrigins = [
    'https://www.sitemasperu.com',
    'https://sitemasperu.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Usuario, Authorization');

// Preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Credenciales SOLO desde config.php (fuera del repositorio). Sin fallback con
// secretos embebidos (S3): si config.php falta o está incompleto, se falla seguro.
if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}
if (!defined('DB_HOST') || !defined('DB_USER') || !defined('DB_PASS') || !defined('DB_NAME')) {
    http_response_code(500);
    echo json_encode(['error' => 'Configuración del servidor ausente o incompleta.']);
    exit;
}

// Secreto para firmar/verificar tokens. Si config.php no lo define, se deriva
// de forma determinista de DB_PASS (valor disponible solo en el servidor).
if (!defined('AUTH_SECRET')) {
    define('AUTH_SECRET', hash('sha256', DB_PASS . '|asesoria-auth-v1'));
}

try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión: ' . $e->getMessage()]);
    exit;
}

// Zona horaria de Perú
date_default_timezone_set('America/Lima');

// Tablas que tienen columna fecha_creacion (evita SHOW COLUMNS en cada GET)
$TABLES_WITH_AUDIT = [
    'clientes', 'bancos', 'seguros', 'coberturas', 'cuentas_bancarias',
    'tarjetas', 'siniestros', 'reclamos', 'detalle_reclamos',
    'eventos_reclamo', 'adelantos', 'usuarios', 'roles', 'permisos_rol',
    'plantillas_pasos', 'pasos_reclamo', 'pagos_seguro',
    'vueltas', 'vuelta_evidencias', 'codigos_bloqueo',
    'recargas', 'recarga_items',
    'cuadres', 'cuadre_gastos',
];

// Mapeo colecciones JS → tablas MySQL + columnas
$TABLE_MAP = [
    'clients' => [
        'table' => 'clientes',
        'cols' => [
            'id' => 'id',
            'nombreCompleto' => 'nombre_completo',
            'apellidosCompletos' => 'apellidos_completos',
            'dni' => 'dni',
            'fechaNacimiento' => 'fecha_nacimiento',
            'telefono1' => 'telefono1',
            'telefono2' => 'telefono2',
            'email1' => 'email1',
            'email2' => 'email2',
            'dniFrontal' => 'dni_frontal',
            'dniPosterior' => 'dni_posterior',
            'huella' => 'huella',
            'firma' => 'firma',
            'direccion' => 'direccion',
            'gpsLatitud' => 'gps_latitud',
            'gpsLongitud' => 'gps_longitud',
            'observaciones' => 'observaciones',
        ]
    ],
    'banks' => [
        'table' => 'bancos',
        'cols' => [
            'id' => 'id',
            'nombre' => 'nombre',
        ]
    ],
    'insurances' => [
        'table' => 'seguros',
        'cols' => [
            'id' => 'id',
            'nombre' => 'nombre',
            'descripcion' => 'descripcion',
            'bancoId' => 'banco_id',
            'poliza' => 'poliza',
        ]
    ],
    'coverages' => [
        'table' => 'coberturas',
        'cols' => [
            'id' => 'id',
            'seguroId' => 'seguro_id',
            'nombre' => 'nombre',
            'descripcion' => 'descripcion',
            'monto' => 'monto',
        ]
    ],
    'bankAccounts' => [
        'table' => 'cuentas_bancarias',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'bancoId' => 'banco_id',
            'moneda' => 'moneda',
            'numeroCuenta' => 'numero_cuenta',
        ]
    ],
    'cards' => [
        'table' => 'tarjetas',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'bancoId' => 'banco_id',
            'seguroId' => 'seguro_id',
            'numero' => 'numero',
            'numeroCuenta' => 'numero_cuenta',
            'numeroCCI' => 'numero_cci',
            'moneda' => 'moneda',
            'comentario' => 'comentario',
            'activo' => 'activo',
            'evidenciaSeguro' => 'evidencia_seguro',
        ]
    ],
    'incidents' => [
        'table' => 'siniestros',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'fecha' => 'fecha',
            'denunciaDescripcion' => 'denuncia_descripcion',
            'denunciaArchivo' => 'denuncia_archivo',
            'denunciaFormato' => 'denuncia_formato',
        ]
    ],
    'claims' => [
        'table' => 'reclamos',
        'cols' => [
            'id' => 'id',
            'siniestroId' => 'siniestro_id',
            'bancoId' => 'banco_id',
            'fecha' => 'fecha',
            'observaciones' => 'observaciones',
            'evidencia' => 'evidencia',
            'montoTotal' => 'monto_total',
            'estado' => 'estado',
        ]
    ],
    'claimDetails' => [
        'table' => 'detalle_reclamos',
        'cols' => [
            'id' => 'id',
            'reclamoId' => 'reclamo_id',
            'coberturaId' => 'cobertura_id',
            'monto' => 'monto',
            'montoSiniestrado' => 'monto_siniestrado',
            'moneda' => 'moneda',
            'tipoCambio' => 'tipo_cambio',
            'montoSoles' => 'monto_soles',
            'evidencia' => 'evidencia',
        ]
    ],
    'claimEvents' => [
        'table' => 'eventos_reclamo',
        'cols' => [
            'id' => 'id',
            'reclamoId' => 'reclamo_id',
            'fecha' => 'fecha',
            'fechaRegistro' => 'fecha_registro',
            'descripcion' => 'descripcion',
            'observacion' => 'observacion',
            'evidencia' => 'evidencia',
            'evidenciaNombre' => 'evidencia_nombre',
            'archivos' => 'archivos',
            'diasEspera' => 'dias_espera',
            'tipoDias' => 'tipo_dias',
            'fechaVencimiento' => 'fecha_vencimiento',
            'eventoOrigenId' => 'evento_origen_id',
            'stepId' => 'paso_id',
        ]
    ],
    'stepTemplates' => [
        'table' => 'plantillas_pasos',
        'cols' => [
            'id' => 'id',
            'bancoId' => 'banco_id',
            'orden' => 'orden',
            'nombre' => 'nombre',
            'descripcion' => 'descripcion',
            'diasEspera' => 'dias_espera',
            'tipoDias' => 'tipo_dias',
            'requiereRespuesta' => 'requiere_respuesta',
            'tipoPaso' => 'tipo_paso',
            'opcional' => 'opcional',
            'activo' => 'activo',
        ]
    ],
    'claimSteps' => [
        'table' => 'pasos_reclamo',
        'cols' => [
            'id' => 'id',
            'reclamoId' => 'reclamo_id',
            'plantillaId' => 'plantilla_id',
            'orden' => 'orden',
            'nombre' => 'nombre',
            'descripcion' => 'descripcion',
            'diasEspera' => 'dias_espera',
            'tipoDias' => 'tipo_dias',
            'requiereRespuesta' => 'requiere_respuesta',
            'tipoPaso' => 'tipo_paso',
            'opcional' => 'opcional',
            'estado' => 'estado',
            'fechaCompletado' => 'fecha_completado',
        ]
    ],
    'payments' => [
        'table' => 'pagos_seguro',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'bancoId' => 'banco_id',
            'fecha' => 'fecha',
            'periodicidad' => 'periodicidad',
            'monto' => 'monto',
            'moneda' => 'moneda',
            'evidencia' => 'evidencia',
            'observaciones' => 'observaciones',
        ]
    ],
    'vueltas' => [
        'table' => 'vueltas',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'siniestroId' => 'siniestro_id',
            'fecha' => 'fecha',
            'estado' => 'estado',
            'fechaCierre' => 'fecha_cierre',
            'denunciaEvidencia' => 'denuncia_evidencia',
            'denunciaFecha' => 'denuncia_fecha',
            'bancoIds' => 'banco_ids',
            'observaciones' => 'observaciones',
        ]
    ],
    'vueltaEvidencias' => [
        'table' => 'vuelta_evidencias',
        'cols' => [
            'id' => 'id',
            'vueltaId' => 'vuelta_id',
            'bancoId' => 'banco_id',
            'tipo' => 'tipo',
            'evidencia' => 'evidencia',
            'fecha' => 'fecha',
            'hora' => 'hora',
            'concepto' => 'concepto',
        ]
    ],
    'blockingCodes' => [
        'table' => 'codigos_bloqueo',
        'cols' => [
            'id' => 'id',
            'vueltaId' => 'vuelta_id',
            'bancoId' => 'banco_id',
            'codigo' => 'codigo',
            'tarjetaIds' => 'tarjeta_ids',
            'observacion' => 'observacion',
            'fecha' => 'fecha',
            'hora' => 'hora',
            'evidencia' => 'evidencia',
        ]
    ],
    'config' => [
        'table' => 'configuracion',
        'cols' => [
            'id' => 'id',
            'valor' => 'valor',
        ]
    ],
    'roles' => [
        'table' => 'roles',
        'cols' => [
            'id' => 'id',
            'nombre' => 'nombre',
            'descripcion' => 'descripcion',
        ]
    ],
    'users' => [
        'table' => 'usuarios',
        'cols' => [
            'id' => 'id',
            'usuario' => 'usuario',
            'clave' => 'clave',
            'nombreCompleto' => 'nombre_completo',
            'rolId' => 'rol_id',
            'activo' => 'activo',
        ]
    ],
    'rolePermissions' => [
        'table' => 'permisos_rol',
        'cols' => [
            'id' => 'id',
            'rolId' => 'rol_id',
            'pantalla' => 'pantalla',
            'acceso' => 'acceso',
        ]
    ],
    'advances' => [
        'table' => 'adelantos',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'fecha' => 'fecha',
            'monto' => 'monto',
            'moneda' => 'moneda',
            'tipoCambio' => 'tipo_cambio',
            'montoSoles' => 'monto_soles',
            'concepto' => 'concepto',
            'observaciones' => 'observaciones',
            'evidencia' => 'evidencia',
        ]
    ],
    'recargas' => [
        'table' => 'recargas',
        'cols' => [
            'id' => 'id',
            'clienteId' => 'cliente_id',
            'nombre' => 'nombre',
            'fecha' => 'fecha',
            'observaciones' => 'observaciones',
        ]
    ],
    'recargaItems' => [
        'table' => 'recarga_items',
        'cols' => [
            'id' => 'id',
            'recargaId' => 'recarga_id',
            'bancoId' => 'banco_id',
            'monto' => 'monto',
            'moneda' => 'moneda',
            'fecha' => 'fecha',
            'evidencia' => 'evidencia',
            'observaciones' => 'observaciones',
        ]
    ],
    'cuadres' => [
        'table' => 'cuadres',
        'cols' => [
            'id' => 'id',
            'recargaId' => 'recarga_id',
            'tipoCambio' => 'tipo_cambio',
            'reclamoIds' => 'reclamo_ids',
            'observaciones' => 'observaciones',
        ]
    ],
    'cuadreGastos' => [
        'table' => 'cuadre_gastos',
        'cols' => [
            'id' => 'id',
            'cuadreId' => 'cuadre_id',
            'concepto' => 'concepto',
            'monto' => 'monto',
            'moneda' => 'moneda',
            'fecha' => 'fecha',
            'evidencia' => 'evidencia',
            'observaciones' => 'observaciones',
            'informativo' => 'informativo',
            'bancoId' => 'banco_id',
        ]
    ],
];

// ============================================================
// Funciones helper
// ============================================================

/** Convierte fila MySQL (snake_case) a objeto JS (camelCase) */
function toJsEntity($row, $cols) {
    $entity = [];
    $reverse = array_flip($cols);
    foreach ($row as $dbCol => $value) {
        if (isset($reverse[$dbCol])) {
            $jsKey = $reverse[$dbCol];
            if ($dbCol === 'activo') {
                $entity[$jsKey] = (bool)$value;
            } elseif ($value instanceof DateTime || preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$value)) {
                // Mantener fechas como string
                $entity[$jsKey] = $value;
            } else {
                $entity[$jsKey] = $value;
            }
        }
    }
    // Agregar campos de auditoría si existen en la fila
    $auditCols = [
        'creado_por' => 'creadoPor',
        'modificado_por' => 'modificadoPor',
        'equipo_registro' => 'equipoRegistro',
        'fecha_creacion' => 'fechaCreacion',
        'fecha_modificacion' => 'fechaModificacion',
    ];
    foreach ($auditCols as $dbCol => $jsKey) {
        if (array_key_exists($dbCol, $row)) {
            $entity[$jsKey] = $row[$dbCol];
        }
    }
    return $entity;
}

/** Convierte objeto JS (camelCase) a fila MySQL (snake_case) */
function toDbRow($entity, $cols) {
    $row = [];
    foreach ($cols as $jsKey => $dbCol) {
        if (array_key_exists($jsKey, $entity)) {
            $row[$dbCol] = $entity[$jsKey];
        }
    }
    return $row;
}

/** Genera UUID v4 */
function generateUUID() {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/** Obtener cuentaIds de una tarjeta */
function getCardCuentaIds($pdo, $cardId) {
    $stmt = $pdo->prepare('SELECT cuenta_id FROM tarjetas_cuentas WHERE tarjeta_id = ?');
    $stmt->execute([$cardId]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

/** Obtener mapa tarjetaId → [cuentaIds] para todas las tarjetas en una sola query */
function getAllCardCuentaIdsMap($pdo) {
    $stmt = $pdo->query('SELECT tarjeta_id, GROUP_CONCAT(cuenta_id) as cuenta_ids FROM tarjetas_cuentas GROUP BY tarjeta_id');
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[$row['tarjeta_id']] = $row['cuenta_ids'] ? explode(',', $row['cuenta_ids']) : [];
    }
    return $map;
}

/** Guardar cuentaIds de una tarjeta */
function setCardCuentaIds($pdo, $cardId, $cuentaIds) {
    $pdo->prepare('DELETE FROM tarjetas_cuentas WHERE tarjeta_id = ?')->execute([$cardId]);
    $stmt = $pdo->prepare('INSERT INTO tarjetas_cuentas (tarjeta_id, cuenta_id) VALUES (?, ?)');
    foreach ($cuentaIds as $cuentaId) {
        $stmt->execute([$cardId, $cuentaId]);
    }
}

// ============================================================
// Auditoría: campos automáticos
// ============================================================

/** Obtiene info de auditoría del request actual */
function getAuditInfo() {
    $usuario = $_SERVER['HTTP_X_USUARIO'] ?? null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
    $equipo = $ip . ' | ' . mb_substr($ua, 0, 200);
    return [
        'usuario' => $usuario,
        'equipo' => $equipo,
    ];
}

/** Genera una descripción legible de una fila eliminada para el log de auditoría */
function describeDeleted($row) {
    $candidatos = ['descripcion', 'nombre_completo', 'nombre', 'numero', 'observacion', 'observaciones'];
    $label = null;
    foreach ($candidatos as $c) {
        if (!empty($row[$c])) { $label = mb_substr($row[$c], 0, 120); break; }
    }
    $fecha = $row['fecha'] ?? $row['fecha_creacion'] ?? null;
    $partes = array_filter([$label, $fecha]);
    return $partes ? implode(' — ', $partes) : ('registro ' . ($row['id'] ?? ''));
}

/** Registra una eliminación (o intento denegado) en el log de auditoría. No rompe el flujo si falla. */
function logEliminacion($pdo, $coleccion, $regId, $descripcion, $usuario, $equipo, $resultado) {
    try {
        $pdo->prepare("INSERT INTO auditoria_eliminaciones (id, coleccion, registro_id, descripcion, usuario, equipo, fecha, resultado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([
                generateUUID(), $coleccion, $regId, $descripcion,
                $usuario, $equipo, date('Y-m-d H:i:s'), $resultado,
            ]);
    } catch (PDOException $e) { /* tabla/columna ausente: continuar sin romper */ }
}

// ============================================================
// Autenticación por token (HMAC, sin estado)
// ============================================================

function b64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function b64url_decode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

/** Genera un token firmado para un usuario. TTL por defecto 3 horas. */
function makeAuthToken($user, $ttl = 10800) {
    $payload = b64url_encode(json_encode([
        'uid' => $user['id'],
        'usr' => $user['usuario'],
        'rol' => $user['rolNombre'] ?? null,
        'exp' => time() + $ttl,
    ]));
    $sig = b64url_encode(hash_hmac('sha256', $payload, AUTH_SECRET, true));
    return $payload . '.' . $sig;
}

/** Verifica un token. Retorna el payload (array) o null si es inválido/expirado. */
function verifyAuthToken($token) {
    if (!$token || strpos($token, '.') === false) return null;
    [$payload, $sig] = explode('.', $token, 2);
    $expected = b64url_encode(hash_hmac('sha256', $payload, AUTH_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(b64url_decode($payload), true);
    if (!is_array($data) || ($data['exp'] ?? 0) < time()) return null;
    return $data;
}

/** Token corto y firmado para el 2º factor (entre paso 1 y 2 del login). TTL 5 min. */
function makeChallengeToken($userId, $digit, $digits = [], $ttl = 300) {
    $payload = b64url_encode(json_encode([
        'uid' => $userId,
        'd'   => $digit,
        'ds'  => implode('', $digits), // los 4 dígitos mostrados, para detectar al que copia el captcha tal cual
        'typ' => '2fa',
        'exp' => time() + $ttl,
    ]));
    $sig = b64url_encode(hash_hmac('sha256', $payload, AUTH_SECRET, true));
    return $payload . '.' . $sig;
}
function verifyChallengeToken($token) {
    if (!$token || strpos($token, '.') === false) return null;
    [$payload, $sig] = explode('.', $token, 2);
    $expected = b64url_encode(hash_hmac('sha256', $payload, AUTH_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(b64url_decode($payload), true);
    if (!is_array($data) || ($data['typ'] ?? '') !== '2fa' || ($data['exp'] ?? 0) < time()) return null;
    return $data;
}
/** Calcula el código esperado desde la regla (offsets CSV) y el dígito resaltado (con vuelta 0↔9). */
function computeSecurityCode($offsetsCsv, $digit) {
    $offsets = array_values(array_filter(array_map('trim', explode(',', (string)$offsetsCsv)), function ($x) { return $x !== ''; }));
    if (empty($offsets)) return null;
    $code = '';
    foreach ($offsets as $o) {
        $code .= (string)(((($digit + (int)$o) % 10) + 10) % 10);
    }
    return $code;
}

/**
 * Registra un evento CRÍTICO de seguridad (ej: falló el captcha del 2º factor).
 * Crea la tabla log_seguridad automáticamente si aún no existe.
 */
function logSeguridadCritico($pdo, $usuario, $ip, $detalle) {
    $insert = function () use ($pdo, $usuario, $ip, $detalle) {
        $pdo->prepare("INSERT INTO log_seguridad (nivel, usuario, ip, detalle, fecha) VALUES ('CRITICO', ?, ?, ?, NOW())")
            ->execute([$usuario, $ip, $detalle]);
    };
    try {
        $insert();
    } catch (PDOException $e) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS log_seguridad (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nivel VARCHAR(20) NOT NULL,
                usuario VARCHAR(100) NULL,
                ip VARCHAR(64) NULL,
                detalle VARCHAR(500) NULL,
                fecha DATETIME NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            $insert();
        } catch (PDOException $e2) { /* nunca bloquear el login por un fallo del log */ }
    }
}

/** Extrae el token del header Authorization: Bearer xxx */
function getRequestToken() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower($k) === 'authorization') { $auth = $v; break; }
        }
    }
    if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return trim($m[1]);
    return '';
}

/** Exige un token válido; si no, responde 401 y termina. Retorna el payload. */
function requireAuth() {
    $data = verifyAuthToken(getRequestToken());
    if (!$data) {
        http_response_code(401);
        echo json_encode(['error' => 'No autorizado. Inicie sesión nuevamente.']);
        exit;
    }
    return $data;
}

// ============================================================
// Router
// ============================================================

$method = $_SERVER['REQUEST_METHOD'];
$collection = $_GET['collection'] ?? null;
$action = $_GET['action'] ?? null;
$id = $_GET['id'] ?? null;

// ========== LOGIN con rate limiting + password hashing ==========
if ($action === 'login' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $usuario = trim($input['usuario'] ?? '');
    $clave = $input['clave'] ?? '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    if (!$usuario || !$clave) {
        http_response_code(400);
        echo json_encode(['error' => 'Usuario y contraseña son requeridos.']);
        exit;
    }

    // Rate limiting: máx 10 intentos fallidos por IP en 15 minutos
    try {
        $ventana = date('Y-m-d H:i:s', strtotime('-15 minutes'));
        $stmtRL = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND intentado_en > ?");
        $stmtRL->execute([$ip, $ventana]);
        $intentos = (int)$stmtRL->fetchColumn();
        if ($intentos >= 10) {
            http_response_code(429);
            echo json_encode(['error' => 'Demasiados intentos fallidos. Espere 15 minutos.']);
            exit;
        }
    } catch (PDOException $e) { /* tabla de intentos no existe, continuar sin rate limiting */ }

    try {
        $stmt = $pdo->prepare("SELECT u.*, r.nombre AS rol_nombre FROM usuarios u INNER JOIN roles r ON u.rol_id = r.id WHERE u.usuario = ? AND u.activo = 1");
        $stmt->execute([$usuario]);
        $user = $stmt->fetch();

        $claveOk = false;
        if ($user) {
            $claveStored = $user['clave'];
            // Intentar verificar como hash bcrypt primero (funciona en PHP 7 y 8)
            $claveOk = password_verify($clave, $claveStored);
            if (!$claveOk) {
                // Fallback: comparar como texto plano (contraseñas antiguas sin hashear)
                $claveOk = ($clave === $claveStored);
                if ($claveOk) {
                    // Migrar a hash bcrypt
                    $hash = password_hash($clave, PASSWORD_BCRYPT, ['cost' => 8]);
                    $pdo->prepare("UPDATE usuarios SET clave = ? WHERE id = ?")->execute([$hash, $user['id']]);
                }
            }
        }

        if (!$user || !$claveOk) {
            // Registrar intento fallido
            try {
                $pdo->prepare("INSERT INTO login_attempts (ip, usuario, intentado_en) VALUES (?, ?, NOW())")
                    ->execute([$ip, $usuario]);
            } catch (PDOException $e) {}
            http_response_code(401);
            echo json_encode(['error' => 'Usuario o contraseña incorrectos.']);
            exit;
        }

        // Login exitoso: limpiar intentos fallidos de esta IP
        try {
            $pdo->prepare("DELETE FROM login_attempts WHERE ip = ?")->execute([$ip]);
        } catch (PDOException $e) {}

        // Obtener permisos del rol
        $stmtP = $pdo->prepare("SELECT pantalla FROM permisos_rol WHERE rol_id = ? AND acceso = 1");
        $stmtP->execute([$user['rol_id']]);
        $pantallas = $stmtP->fetchAll(PDO::FETCH_COLUMN);

        $userOut = [
            'id' => $user['id'],
            'usuario' => $user['usuario'],
            'nombreCompleto' => $user['nombre_completo'],
            'rolId' => $user['rol_id'],
            'rolNombre' => $user['rol_nombre'],
        ];

        // 2º factor: si el usuario tiene código de seguridad configurado, NO se entrega
        // el token todavía; se devuelve un desafío (números con uno resaltado).
        $codigoSeg = $user['codigo_seguridad'] ?? null;
        if ($codigoSeg !== null && trim($codigoSeg) !== '') {
            $digit = random_int(0, 9);
            $pos = random_int(0, 3);
            $digits = [];
            for ($i = 0; $i < 4; $i++) $digits[] = ($i === $pos) ? $digit : random_int(0, 9);
            echo json_encode([
                'success' => true,
                'twofa' => true,
                'challenge' => ['digits' => $digits, 'highlight' => $pos],
                'challengeToken' => makeChallengeToken($user['id'], $digit, $digits),
            ]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'user' => $userOut,
            'permisos' => $pantallas,
            'token' => makeAuthToken($userOut),
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

// ========== LOGIN paso 2: verificar código de seguridad (2º factor) ==========
if ($action === 'login2fa' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $challengeToken = $input['challengeToken'] ?? '';
    $codigo = trim((string)($input['codigo'] ?? ''));
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    // Rate limiting (reutiliza login_attempts): máx 10 intentos por IP en 15 min.
    try {
        $ventana = date('Y-m-d H:i:s', strtotime('-15 minutes'));
        $stmtRL = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND intentado_en > ?");
        $stmtRL->execute([$ip, $ventana]);
        if ((int)$stmtRL->fetchColumn() >= 10) {
            http_response_code(429);
            echo json_encode(['error' => 'Demasiados intentos. Espere 15 minutos.']);
            exit;
        }
    } catch (PDOException $e) { /* sin rate limiting */ }

    $ch = verifyChallengeToken($challengeToken);
    if (!$ch) {
        http_response_code(400);
        echo json_encode(['error' => 'El desafío expiró. Vuelva a iniciar sesión.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("SELECT u.*, r.nombre AS rol_nombre FROM usuarios u INNER JOIN roles r ON u.rol_id = r.id WHERE u.id = ? AND u.activo = 1");
        $stmt->execute([$ch['uid']]);
        $user = $stmt->fetch();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Usuario no encontrado.']); exit; }

        $expected = computeSecurityCode($user['codigo_seguridad'] ?? '', (int)$ch['d']);
        if ($expected === null || !hash_equals($expected, $codigo)) {
            // Código incorrecto: registrar intento (rate limiting) y como evento CRÍTICO.
            try { $pdo->prepare("INSERT INTO login_attempts (ip, usuario, intentado_en) VALUES (?, ?, NOW())")->execute([$ip, $user['usuario']]); } catch (PDOException $e) {}
            $captchaMostrado = (string)($ch['ds'] ?? '');
            if ($captchaMostrado !== '' && hash_equals($captchaMostrado, $codigo)) {
                // Escribió el captcha TAL CUAL (no conoce la regla secreta) → menú falso.
                logSeguridadCritico($pdo, $user['usuario'], $ip, 'Ingresó el captcha tal cual en el 2º factor → enviado al menú falso.');
                echo json_encode(['success' => false, 'decoy' => true]);
                exit;
            }
            // Escribió otra cosa: se le insiste en que ingrese el captcha mostrado.
            logSeguridadCritico($pdo, $user['usuario'], $ip, 'Código incorrecto en el 2º factor (no coincide con el captcha mostrado). Ingresó ' . strlen($codigo) . ' caracteres.');
            echo json_encode(['success' => false, 'error' => 'El código captcha es incorrecto. Debe ingresar el código captcha mostrado para ingresar al sistema.']);
            exit;
        }

        // Correcto: limpiar intentos y entregar el token real.
        try { $pdo->prepare("DELETE FROM login_attempts WHERE ip = ?")->execute([$ip]); } catch (PDOException $e) {}
        $stmtP = $pdo->prepare("SELECT pantalla FROM permisos_rol WHERE rol_id = ? AND acceso = 1");
        $stmtP->execute([$user['rol_id']]);
        $pantallas = $stmtP->fetchAll(PDO::FETCH_COLUMN);
        $userOut = [
            'id' => $user['id'],
            'usuario' => $user['usuario'],
            'nombreCompleto' => $user['nombre_completo'],
            'rolId' => $user['rol_id'],
            'rolNombre' => $user['rol_nombre'],
        ];
        echo json_encode(['success' => true, 'user' => $userOut, 'permisos' => $pantallas, 'token' => makeAuthToken($userOut)]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

// ============================================================
// A PARTIR DE AQUÍ TODO REQUIERE TOKEN VÁLIDO
// (login es el único endpoint público; ya fue manejado arriba)
// ============================================================
$AUTH = requireAuth();

// ========== CAMBIAR CONTRASEÑA (usuario logueado) ==========
if ($action === 'changePassword' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = $input['userId'] ?? '';
    $claveActual = $input['claveActual'] ?? '';
    $claveNueva = $input['claveNueva'] ?? '';

    if (!$userId || !$claveActual || !$claveNueva) {
        http_response_code(400);
        echo json_encode(['error' => 'Todos los campos son requeridos.']);
        exit;
    }

    if (strlen($claveNueva) < 4) {
        http_response_code(400);
        echo json_encode(['error' => 'La nueva contraseña debe tener al menos 4 caracteres.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("SELECT clave FROM usuarios WHERE id = ?");
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Usuario no encontrado.']);
            exit;
        }
        $stored = $row['clave'];
        $valida = password_verify($claveActual, $stored) || ($claveActual === $stored);
        if (!$valida) {
            http_response_code(401);
            echo json_encode(['error' => 'La contraseña actual es incorrecta.']);
            exit;
        }

        $hash = password_hash($claveNueva, PASSWORD_BCRYPT);
        $pdo->prepare("UPDATE usuarios SET clave = ? WHERE id = ?")->execute([$hash, $userId]);
        echo json_encode(['success' => true, 'message' => 'Contraseña actualizada exitosamente.']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

// ========== CÓDIGO DE SEGURIDAD (2º factor) — usuario logueado ==========
if ($action === 'securityCodeStatus') {
    try {
        $stmt = $pdo->prepare("SELECT codigo_seguridad FROM usuarios WHERE id = ?");
        $stmt->execute([$AUTH['uid']]);
        $cs = $stmt->fetchColumn();
        echo json_encode(['configured' => ($cs !== null && trim((string)$cs) !== '')]);
    } catch (PDOException $e) { echo json_encode(['configured' => false]); }
    exit;
}

if ($action === 'setSecurityCode' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    // Desactivar el 2º factor del propio usuario.
    if (!empty($input['disable'])) {
        $pdo->prepare("UPDATE usuarios SET codigo_seguridad = NULL WHERE id = ?")->execute([$AUTH['uid']]);
        echo json_encode(['success' => true, 'configured' => false]);
        exit;
    }
    $offsets = $input['offsets'] ?? [];
    if (!is_array($offsets) || count($offsets) < 2 || count($offsets) > 4) {
        http_response_code(400);
        echo json_encode(['error' => 'La regla debe tener entre 2 y 4 posiciones.']);
        exit;
    }
    $clean = [];
    foreach ($offsets as $o) {
        if (!is_numeric($o)) { http_response_code(400); echo json_encode(['error' => 'Regla inválida.']); exit; }
        $n = (int)$o;
        if ($n < -9 || $n > 9) { http_response_code(400); echo json_encode(['error' => 'Regla inválida.']); exit; }
        $clean[] = $n;
    }
    try {
        $pdo->prepare("UPDATE usuarios SET codigo_seguridad = ? WHERE id = ?")->execute([implode(',', $clean), $AUTH['uid']]);
        echo json_encode(['success' => true, 'configured' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'resetSecurityCode' && $method === 'POST') {
    if (($AUTH['rol'] ?? null) !== 'Administrador') {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado.']);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = $input['userId'] ?? '';
    if (!$userId) { http_response_code(400); echo json_encode(['error' => 'userId requerido.']); exit; }
    try {
        $pdo->prepare("UPDATE usuarios SET codigo_seguridad = NULL WHERE id = ?")->execute([$userId]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

// ========== ACTIVIDAD DE USUARIOS ==========
if ($action === 'activity' && $method === 'GET') {
    $fechaInicio = $_GET['desde'] ?? date('Y-m-d');
    $fechaFin = $_GET['hasta'] ?? date('Y-m-d');
    $fechaFinDb = $fechaFin . ' 23:59:59';

    $tablas = [
        'clientes' => 'Cliente',
        'bancos' => 'Banco',
        'seguros' => 'Seguro',
        'coberturas' => 'Cobertura',
        'cuentas_bancarias' => 'Cuenta Bancaria',
        'tarjetas' => 'Tarjeta',
        'siniestros' => 'Siniestro',
        'reclamos' => 'Reclamo',
        'detalle_reclamos' => 'Detalle Reclamo',
        'eventos_reclamo' => 'Evento Reclamo',
        'roles' => 'Rol',
        'usuarios' => 'Usuario',
        'permisos_rol' => 'Permiso',
    ];

    $results = [];
    foreach ($tablas as $tabla => $label) {
        // Verificar que la tabla tenga la columna fecha_creacion
        try {
            $check = $pdo->query("SHOW COLUMNS FROM `$tabla` LIKE 'fecha_creacion'");
            if ($check->rowCount() === 0) continue;
        } catch (PDOException $e) { continue; }

        // Creaciones
        try {
            $stmt = $pdo->prepare("SELECT id, creado_por, equipo_registro, fecha_creacion AS fecha FROM `$tabla` WHERE fecha_creacion IS NOT NULL AND fecha_creacion BETWEEN ? AND ?");
            $stmt->execute([$fechaInicio, $fechaFinDb]);
            foreach ($stmt->fetchAll() as $row) {
                $results[] = [
                    'entidad' => $label,
                    'accion' => 'Creación',
                    'usuario' => $row['creado_por'],
                    'equipo' => $row['equipo_registro'],
                    'fecha' => $row['fecha'],
                    'registroId' => $row['id'],
                ];
            }
        } catch (PDOException $e) { /* ignorar */ }

        // Modificaciones
        try {
            $stmt2 = $pdo->prepare("SELECT id, modificado_por, equipo_registro, fecha_modificacion AS fecha FROM `$tabla` WHERE fecha_modificacion IS NOT NULL AND fecha_modificacion BETWEEN ? AND ?");
            $stmt2->execute([$fechaInicio, $fechaFinDb]);
            foreach ($stmt2->fetchAll() as $row) {
                $results[] = [
                    'entidad' => $label,
                    'accion' => 'Modificación',
                    'usuario' => $row['modificado_por'],
                    'equipo' => $row['equipo_registro'],
                    'fecha' => $row['fecha'],
                    'registroId' => $row['id'],
                ];
            }
        } catch (PDOException $e) { /* ignorar */ }
    }

    // Eliminaciones e intentos denegados (desde el log de auditoría)
    try {
        $stmtDel = $pdo->prepare("SELECT coleccion, registro_id, descripcion, usuario, equipo, fecha, resultado FROM auditoria_eliminaciones WHERE fecha BETWEEN ? AND ?");
        $stmtDel->execute([$fechaInicio, $fechaFinDb]);
        foreach ($stmtDel->fetchAll() as $row) {
            $denegado = (($row['resultado'] ?? 'eliminado') === 'denegado');
            $results[] = [
                'entidad' => $tablas[$row['coleccion']] ?? $row['coleccion'],
                'accion' => $denegado ? 'Intento de eliminación' : 'Eliminación',
                'usuario' => $row['usuario'],
                'equipo' => $row['equipo'],
                'fecha' => $row['fecha'],
                'registroId' => $row['registro_id'],
                'descripcion' => $denegado ? ('🚫 DENEGADO — ' . $row['descripcion']) : $row['descripcion'],
            ];
        }
    } catch (PDOException $e) { /* tabla de auditoría aún no existe */ }

    // Eventos críticos de seguridad (intentos fallidos del captcha del 2º factor)
    try {
        $stmtSec = $pdo->prepare("SELECT nivel, usuario, ip, detalle, fecha FROM log_seguridad WHERE fecha BETWEEN ? AND ?");
        $stmtSec->execute([$fechaInicio, $fechaFinDb]);
        foreach ($stmtSec->fetchAll() as $row) {
            $results[] = [
                'entidad' => 'Seguridad',
                'accion' => '⚠️ CRÍTICO',
                'usuario' => $row['usuario'],
                'equipo' => $row['ip'],
                'fecha' => $row['fecha'],
                'registroId' => null,
                'descripcion' => $row['detalle'],
            ];
        }
    } catch (PDOException $e) { /* tabla log_seguridad aún no existe */ }

    usort($results, function($a, $b) {
        return strcmp($b['fecha'] ?? '', $a['fecha'] ?? '');
    });

    echo json_encode($results);
    exit;
}

// ========== RESETEAR CONTRASEÑA (solo admin) ==========
if ($action === 'resetPassword' && $method === 'POST') {
    if (($AUTH['rol'] ?? null) !== 'Administrador') {
        http_response_code(403);
        echo json_encode(['error' => 'Solo un administrador puede resetear contraseñas.']);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = $input['userId'] ?? '';

    if (!$userId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de usuario requerido.']);
        exit;
    }

    try {
        $hash = password_hash('4321', PASSWORD_BCRYPT);
        $pdo->prepare("UPDATE usuarios SET clave = ? WHERE id = ?")->execute([$hash, $userId]);
        echo json_encode(['success' => true, 'message' => 'Contraseña reseteada a 4321.']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

// ========== UPLOAD DE ARCHIVO ==========
if ($action === 'upload' && $method === 'POST') {
    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No se recibió archivo o hubo un error en la subida.']);
        exit;
    }

    $file = $_FILES['file'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx'];
    $allowedMimes = [
        'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!in_array($ext, $allowedExts)) {
        http_response_code(400);
        echo json_encode(['error' => 'Extensión de archivo no permitida.']);
        exit;
    }
    // Validar MIME real del archivo (no solo la extensión)
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $realMime = $finfo->file($file['tmp_name']);
    if (!in_array($realMime, $allowedMimes)) {
        http_response_code(400);
        echo json_encode(['error' => 'Tipo de archivo no permitido (MIME: ' . $realMime . ').']);
        exit;
    }

    $filename = bin2hex(random_bytes(16)) . '.' . $ext;
    $destPath = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al guardar el archivo en el servidor.']);
        exit;
    }

    echo json_encode(['url' => 'uploads/' . $filename]);
    exit;
}

if (!$collection || !isset($TABLE_MAP[$collection])) {
    http_response_code(404);
    echo json_encode(['error' => 'Colección no encontrada']);
    exit;
}

$mapping = $TABLE_MAP[$collection];
$table = $mapping['table'];
$cols = $mapping['cols'];

// ── Autorización de escritura sobre colecciones sensibles (S1) ──
// Solo un Administrador puede crear/modificar/eliminar usuarios, roles y permisos.
// Cierra la escalada de privilegios (un no-admin cambiándose el rol a Administrador).
$WRITE_ADMIN_ONLY = ['users', 'roles', 'rolePermissions', 'permisos_rol'];
if (in_array($method, ['POST', 'PUT', 'DELETE'], true) && in_array($collection, $WRITE_ADMIN_ONLY, true)) {
    if (($AUTH['rol'] ?? null) !== 'Administrador') {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado: solo un administrador puede modificar usuarios, roles o permisos.']);
        exit;
    }
}

try {
    switch ($method) {

        // ========== GET ==========
        case 'GET':
            if ($id) {
                // GET por ID
                $stmt = $pdo->prepare("SELECT * FROM $table WHERE id = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(null);
                    exit;
                }
                $entity = toJsEntity($row, $cols);
                if ($collection === 'cards') {
                    $entity['cuentaIds'] = getCardCuentaIds($pdo, $entity['id']);
                }
                if ($collection === 'users') unset($entity['clave']); // S2: nunca exponer el hash
                echo json_encode($entity);
            } else {
                // GET todos
                // Ordenar por fecha_creacion si la tabla la tiene (sin SHOW COLUMNS)
                $orderCol = in_array($table, $TABLES_WITH_AUDIT)
                    ? 'fecha_creacion DESC, id DESC'
                    : 'id DESC';
                $stmt = $pdo->query("SELECT * FROM $table ORDER BY $orderCol");
                $rows = $stmt->fetchAll();
                // Para tarjetas: cargar todas las relaciones en 1 sola query (evita N+1)
                $cardCuentaMap = ($collection === 'cards') ? getAllCardCuentaIdsMap($pdo) : [];
                $entities = array_map(function($row) use ($cols, $collection, $pdo, $cardCuentaMap) {
                    $entity = toJsEntity($row, $cols);
                    if ($collection === 'cards') {
                        $entity['cuentaIds'] = $cardCuentaMap[$entity['id']] ?? [];
                    }
                    if ($collection === 'users') unset($entity['clave']); // S2: nunca exponer el hash
                    return $entity;
                }, $rows);
                echo json_encode($entities);
            }
            break;

        // ========== POST ==========
        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(['error' => 'JSON inválido']);
                exit;
            }

            $input['id'] = $input['id'] ?? generateUUID();
            $dbRow = toDbRow($input, $cols);

            if (isset($dbRow['activo'])) {
                $dbRow['activo'] = $dbRow['activo'] ? 1 : 0;
            }

            // Inyectar campos de auditoría
            $audit = getAuditInfo();
            $dbRow['creado_por'] = $audit['usuario'];
            $dbRow['equipo_registro'] = $audit['equipo'];
            $dbRow['fecha_creacion'] = date('Y-m-d H:i:s');

            $columns = array_keys($dbRow);
            $placeholders = implode(', ', array_fill(0, count($columns), '?'));
            $colStr = implode(', ', $columns);
            $values = array_values($dbRow);
            // Convertir null values
            $values = array_map(function($v) { return $v === '' ? null : $v; }, $values);

            $stmt = $pdo->prepare("INSERT INTO $table ($colStr) VALUES ($placeholders)");
            $stmt->execute($values);

            // Manejar cuentaIds para tarjetas
            if ($collection === 'cards' && isset($input['cuentaIds'])) {
                setCardCuentaIds($pdo, $input['id'], $input['cuentaIds']);
            }

            http_response_code(201);
            echo json_encode($input);
            break;

        // ========== PUT ==========
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requerido']);
                exit;
            }

            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(['error' => 'JSON inválido']);
                exit;
            }

            $dbRow = toDbRow($input, $cols);
            unset($dbRow['id']);

            if (isset($dbRow['activo'])) {
                $dbRow['activo'] = $dbRow['activo'] ? 1 : 0;
            }

            // Inyectar campos de auditoría
            $audit = getAuditInfo();
            $dbRow['modificado_por'] = $audit['usuario'];
            $dbRow['equipo_registro'] = $audit['equipo'];
            $dbRow['fecha_modificacion'] = date('Y-m-d H:i:s');

            if (!empty($dbRow)) {
                $setClauses = implode(', ', array_map(function($col) {
                    return "$col = ?";
                }, array_keys($dbRow)));
                $values = array_values($dbRow);
                $values = array_map(function($v) { return $v === '' ? null : $v; }, $values);
                $values[] = $id;

                $stmt = $pdo->prepare("UPDATE $table SET $setClauses WHERE id = ?");
                $stmt->execute($values);
            }

            // Manejar cuentaIds para tarjetas
            if ($collection === 'cards' && isset($input['cuentaIds'])) {
                setCardCuentaIds($pdo, $id, $input['cuentaIds']);
            }

            // Devolver entidad actualizada
            $stmt = $pdo->prepare("SELECT * FROM $table WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'No encontrado']);
                exit;
            }
            $entity = toJsEntity($row, $cols);
            if ($collection === 'cards') {
                $entity['cuentaIds'] = getCardCuentaIds($pdo, $id);
            }
            echo json_encode($entity);
            break;

        // ========== DELETE ==========
        case 'DELETE':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID requerido']);
                exit;
            }

            $esAdmin = (($AUTH['rol'] ?? null) === 'Administrador');
            $audit = getAuditInfo();
            $usuarioAudit = $AUTH['usr'] ?? $audit['usuario']; // del token (confiable)

            // Capturar la fila para la descripción de auditoría
            $delRow = null;
            try {
                $rowStmt = $pdo->prepare("SELECT * FROM $table WHERE id = ?");
                $rowStmt->execute([$id]);
                $delRow = $rowStmt->fetch();
            } catch (PDOException $e) { /* ignorar */ }

            // Solo un administrador puede eliminar. Los demás: registrar intento y rechazar.
            if (!$esAdmin) {
                logEliminacion($pdo, $table, $id, $delRow ? describeDeleted($delRow) : null,
                    $usuarioAudit, $audit['equipo'], 'denegado');
                http_response_code(403);
                echo json_encode(['error' => 'Solo un administrador puede eliminar registros. El intento quedó registrado.']);
                exit;
            }

            // Administrador: registrar eliminación y borrar
            if ($delRow) {
                logEliminacion($pdo, $table, $id, describeDeleted($delRow),
                    $usuarioAudit, $audit['equipo'], 'eliminado');
            }

            if ($collection === 'cards') {
                $pdo->prepare('DELETE FROM tarjetas_cuentas WHERE tarjeta_id = ?')->execute([$id]);
            }

            $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Método no permitido']);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de base de datos: ' . $e->getMessage()]);
}

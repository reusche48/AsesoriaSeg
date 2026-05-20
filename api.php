<?php
/**
 * API REST para Sistema de Asesoría de Seguros
 * Endpoint único que maneja todas las colecciones CRUD
 * 
 * URL: /api.php?collection=clients
 * URL: /api.php?collection=clients&id=xxx
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Usuario');

// Preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Credenciales desde config.php (fuera del repositorio)
if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
} else {
    define('DB_HOST', '107.180.115.202');
    define('DB_USER', 'usuadmin');
    define('DB_PASS', 'Aa@33590728');
    define('DB_NAME', 'asesoria_seguros');
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
            'diasEspera' => 'dias_espera',
            'tipoDias' => 'tipo_dias',
            'fechaVencimiento' => 'fecha_vencimiento',
            'eventoOrigenId' => 'evento_origen_id',
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
        // Crear tabla si no existe
        $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip VARCHAR(45) NOT NULL,
            usuario VARCHAR(100),
            intentado_en DATETIME NOT NULL,
            INDEX idx_ip_time (ip, intentado_en)
        )");
        $ventana = date('Y-m-d H:i:s', strtotime('-15 minutes'));
        $stmtRL = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND intentado_en > ?");
        $stmtRL->execute([$ip, $ventana]);
        $intentos = (int)$stmtRL->fetchColumn();
        if ($intentos >= 10) {
            http_response_code(429);
            echo json_encode(['error' => 'Demasiados intentos fallidos. Espere 15 minutos.']);
            exit;
        }
    } catch (PDOException $e) { /* si falla la tabla de intentos, continuar */ }

    try {
        $stmt = $pdo->prepare("SELECT u.*, r.nombre AS rol_nombre FROM usuarios u INNER JOIN roles r ON u.rol_id = r.id WHERE u.usuario = ? AND u.activo = 1");
        $stmt->execute([$usuario]);
        $user = $stmt->fetch();

        $claveOk = false;
        if ($user) {
            $claveStored = $user['clave'];
            if (password_get_info($claveStored)['algo'] !== null) {
                // Ya está hasheada
                $claveOk = password_verify($clave, $claveStored);
            } else {
                // Texto plano → comparar y migrar automáticamente al hash
                $claveOk = ($clave === $claveStored);
                if ($claveOk) {
                    $hash = password_hash($clave, PASSWORD_BCRYPT);
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

        echo json_encode([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'usuario' => $user['usuario'],
                'nombreCompleto' => $user['nombre_completo'],
                'rolId' => $user['rol_id'],
                'rolNombre' => $user['rol_nombre'],
            ],
            'permisos' => $pantallas,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error: ' . $e->getMessage()]);
    }
    exit;
}

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
        $valida = (password_get_info($stored)['algo'] !== null)
            ? password_verify($claveActual, $stored)
            : ($claveActual === $stored);
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

    usort($results, function($a, $b) {
        return strcmp($b['fecha'] ?? '', $a['fecha'] ?? '');
    });

    echo json_encode($results);
    exit;
}

// ========== RESETEAR CONTRASEÑA (solo admin) ==========
if ($action === 'resetPassword' && $method === 'POST') {
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

-- ============================================================
-- MIGRACIÓN MySQL - Sistema de Asesoría de Seguros
-- Fecha: 2026-03-18
-- Descripción: Creación de tablas, relaciones, índices y datos
-- ============================================================

-- Usar base de datos existente
USE asesoria_seguros;

-- ============================================================
-- TABLAS
-- ============================================================

-- 1. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    apellidos_completos VARCHAR(150) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    fecha_nacimiento DATE DEFAULT NULL,
    telefono1 VARCHAR(30) DEFAULT NULL,
    telefono2 VARCHAR(30) DEFAULT NULL,
    email1 VARCHAR(150) DEFAULT NULL,
    email2 VARCHAR(150) DEFAULT NULL,
    dni_frontal LONGTEXT DEFAULT NULL COMMENT 'Foto DNI frontal en DataURL (base64)',
    dni_posterior LONGTEXT DEFAULT NULL COMMENT 'Foto DNI posterior en DataURL (base64)',
    creado_por VARCHAR(50) DEFAULT NULL COMMENT 'Usuario que creó el registro',
    modificado_por VARCHAR(50) DEFAULT NULL COMMENT 'Último usuario que modificó',
    equipo_registro VARCHAR(255) DEFAULT NULL COMMENT 'IP + User-Agent del equipo',
    fecha_creacion DATETIME DEFAULT NULL COMMENT 'Fecha/hora de creación',
    fecha_modificacion DATETIME DEFAULT NULL COMMENT 'Fecha/hora última modificación',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clientes_dni (dni)
) ENGINE=InnoDB;

-- 2. BANCOS (entidad independiente, sin relación a cliente)
CREATE TABLE IF NOT EXISTS bancos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. SEGUROS (enlazado a banco)
CREATE TABLE IF NOT EXISTS seguros (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    banco_id CHAR(36) NOT NULL,
    poliza LONGTEXT DEFAULT NULL COMMENT 'Archivo de póliza en formato DataURL (base64)',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_seguros_banco FOREIGN KEY (banco_id) REFERENCES bancos(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_seguros_banco (banco_id)
) ENGINE=InnoDB;

-- 4. COBERTURAS (asociadas a un seguro)
CREATE TABLE IF NOT EXISTS coberturas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    seguro_id CHAR(36) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    monto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_coberturas_seguro FOREIGN KEY (seguro_id) REFERENCES seguros(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_coberturas_seguro (seguro_id)
) ENGINE=InnoDB;

-- 5. CUENTAS BANCARIAS
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
    id CHAR(36) NOT NULL PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    banco_id CHAR(36) NOT NULL,
    moneda ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    numero_cuenta VARCHAR(50) DEFAULT '',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cuentas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cuentas_banco FOREIGN KEY (banco_id) REFERENCES bancos(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_cuentas_cliente (cliente_id),
    INDEX idx_cuentas_banco (banco_id),
    INDEX idx_cuentas_cliente_banco (cliente_id, banco_id)
) ENGINE=InnoDB;

-- 6. TARJETAS
CREATE TABLE IF NOT EXISTS tarjetas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    banco_id CHAR(36) NOT NULL,
    seguro_id CHAR(36) NOT NULL,
    numero VARCHAR(30) NOT NULL,
    numero_cuenta VARCHAR(50) NOT NULL,
    moneda ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    comentario TEXT DEFAULT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tarjetas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tarjetas_banco FOREIGN KEY (banco_id) REFERENCES bancos(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tarjetas_seguro FOREIGN KEY (seguro_id) REFERENCES seguros(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_tarjetas_cliente (cliente_id),
    INDEX idx_tarjetas_banco (banco_id),
    INDEX idx_tarjetas_seguro (seguro_id)
) ENGINE=InnoDB;

-- 7. TARJETAS_CUENTAS (relación N:M entre tarjetas y cuentas bancarias)
CREATE TABLE IF NOT EXISTS tarjetas_cuentas (
    tarjeta_id CHAR(36) NOT NULL,
    cuenta_id CHAR(36) NOT NULL,
    PRIMARY KEY (tarjeta_id, cuenta_id),
    CONSTRAINT fk_tc_tarjeta FOREIGN KEY (tarjeta_id) REFERENCES tarjetas(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_tc_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas_bancarias(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 8. SINIESTROS
CREATE TABLE IF NOT EXISTS siniestros (
    id CHAR(36) NOT NULL PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    fecha DATE NOT NULL,
    denuncia_descripcion TEXT NOT NULL,
    denuncia_archivo LONGTEXT DEFAULT NULL COMMENT 'Archivo de denuncia policial en DataURL (base64)',
    denuncia_formato VARCHAR(10) DEFAULT NULL COMMENT 'Formato del archivo: PDF, JPG, PNG',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_siniestros_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_siniestros_cliente (cliente_id),
    INDEX idx_siniestros_fecha (fecha)
) ENGINE=InnoDB;

-- 9. RECLAMOS (se crean automáticamente al agregar banco a siniestro)
CREATE TABLE IF NOT EXISTS reclamos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    siniestro_id CHAR(36) NOT NULL,
    banco_id CHAR(36) NOT NULL,
    fecha DATE NOT NULL,
    observaciones TEXT DEFAULT NULL,
    evidencia LONGTEXT DEFAULT NULL COMMENT 'Evidencia en DataURL (base64)',
    monto_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estado ENUM('Pendiente', 'En Proceso', 'Culminado') NOT NULL DEFAULT 'Pendiente',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_reclamos_siniestro FOREIGN KEY (siniestro_id) REFERENCES siniestros(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_reclamos_banco FOREIGN KEY (banco_id) REFERENCES bancos(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uk_reclamos_siniestro_banco (siniestro_id, banco_id),
    INDEX idx_reclamos_siniestro (siniestro_id),
    INDEX idx_reclamos_banco (banco_id),
    INDEX idx_reclamos_estado (estado)
) ENGINE=InnoDB;

-- 10. DETALLE DE RECLAMOS (coberturas reclamadas por reclamo)
CREATE TABLE IF NOT EXISTS detalle_reclamos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    reclamo_id CHAR(36) NOT NULL,
    cobertura_id CHAR(36) NOT NULL,
    monto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    moneda CHAR(3) NOT NULL DEFAULT 'PEN' COMMENT 'PEN o USD',
    tipo_cambio DECIMAL(8,3) DEFAULT NULL COMMENT 'Tipo de cambio USD→PEN',
    monto_soles DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Monto convertido a soles',
    evidencia LONGTEXT DEFAULT NULL COMMENT 'Evidencia en DataURL (base64)',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_detalle_reclamo FOREIGN KEY (reclamo_id) REFERENCES reclamos(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_detalle_cobertura FOREIGN KEY (cobertura_id) REFERENCES coberturas(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_detalle_reclamo (reclamo_id),
    INDEX idx_detalle_cobertura (cobertura_id)
) ENGINE=InnoDB;

-- 11. EVENTOS DE RECLAMO (seguimiento)
CREATE TABLE IF NOT EXISTS eventos_reclamo (
    id CHAR(36) NOT NULL PRIMARY KEY,
    reclamo_id CHAR(36) NOT NULL,
    fecha DATETIME NOT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    descripcion VARCHAR(100) NOT NULL COMMENT 'Tipo de evento: Reclamo presentado, Documentación enviada, etc.',
    observacion TEXT NOT NULL,
    evidencia LONGTEXT DEFAULT NULL COMMENT 'Evidencia en DataURL (base64)',
    dias_espera INT DEFAULT NULL COMMENT 'Días de espera para respuesta',
    tipo_dias VARCHAR(15) DEFAULT NULL COMMENT 'naturales o laborables',
    fecha_vencimiento DATE DEFAULT NULL COMMENT 'Fecha límite calculada',
    evento_origen_id CHAR(36) DEFAULT NULL COMMENT 'ID del evento origen si es seguimiento',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_eventos_reclamo FOREIGN KEY (reclamo_id) REFERENCES reclamos(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_evento_origen FOREIGN KEY (evento_origen_id) REFERENCES eventos_reclamo(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_eventos_reclamo (reclamo_id),
    INDEX idx_eventos_fecha (fecha),
    INDEX idx_eventos_vencimiento (fecha_vencimiento)
) ENGINE=InnoDB;

-- ============================================================
-- VISTAS ÚTILES
-- ============================================================

-- Vista: Reclamos con información completa (para búsquedas y seguimiento)
CREATE OR REPLACE VIEW v_reclamos_completos AS
SELECT
    r.id AS reclamo_id,
    r.fecha AS reclamo_fecha,
    r.estado,
    r.monto_total,
    s.id AS siniestro_id,
    s.fecha AS siniestro_fecha,
    c.id AS cliente_id,
    CONCAT(c.nombre_completo, ' ', c.apellidos_completos) AS cliente_nombre,
    c.dni AS cliente_dni,
    b.id AS banco_id,
    b.nombre AS banco_nombre,
    DATEDIFF(CURDATE(), r.fecha) AS dias_transcurridos
FROM reclamos r
INNER JOIN siniestros s ON r.siniestro_id = s.id
INNER JOIN clientes c ON s.cliente_id = c.id
INNER JOIN bancos b ON r.banco_id = b.id;

-- Vista: Reclamos pendientes con días de retraso
CREATE OR REPLACE VIEW v_reclamos_pendientes AS
SELECT * FROM v_reclamos_completos
WHERE estado = 'Pendiente'
ORDER BY dias_transcurridos DESC;

-- Vista: Seguimiento completo (reclamos + último evento)
CREATE OR REPLACE VIEW v_seguimiento AS
SELECT
    rc.*,
    ue.ultima_fecha_evento,
    ue.ultima_descripcion,
    ue.ultima_observacion
FROM v_reclamos_completos rc
LEFT JOIN (
    SELECT
        er.reclamo_id,
        er.fecha AS ultima_fecha_evento,
        er.descripcion AS ultima_descripcion,
        er.observacion AS ultima_observacion
    FROM eventos_reclamo er
    INNER JOIN (
        SELECT reclamo_id, MAX(fecha) AS max_fecha
        FROM eventos_reclamo
        GROUP BY reclamo_id
    ) latest ON er.reclamo_id = latest.reclamo_id AND er.fecha = latest.max_fecha
) ue ON rc.reclamo_id = ue.reclamo_id;

-- ============================================================
-- TRIGGER: Actualizar estado del reclamo al insertar evento
-- ============================================================

DELIMITER //

CREATE TRIGGER trg_evento_actualiza_estado
AFTER INSERT ON eventos_reclamo
FOR EACH ROW
BEGIN
    IF LOWER(TRIM(NEW.descripcion)) = 'reclamo indemnizado' THEN
        UPDATE reclamos SET estado = 'Culminado' WHERE id = NEW.reclamo_id;
    ELSEIF LOWER(TRIM(NEW.descripcion)) = 'reclamo presentado' THEN
        UPDATE reclamos SET estado = 'En Proceso'
        WHERE id = NEW.reclamo_id AND estado = 'Pendiente';
    END IF;
END //

-- TRIGGER: Recalcular monto total del reclamo al insertar detalle
CREATE TRIGGER trg_detalle_insert_recalcula_total
AFTER INSERT ON detalle_reclamos
FOR EACH ROW
BEGIN
    UPDATE reclamos
    SET monto_total = (
        SELECT COALESCE(SUM(monto_soles), 0)
        FROM detalle_reclamos
        WHERE reclamo_id = NEW.reclamo_id
    )
    WHERE id = NEW.reclamo_id;
END //

-- TRIGGER: Recalcular monto total del reclamo al actualizar detalle
CREATE TRIGGER trg_detalle_update_recalcula_total
AFTER UPDATE ON detalle_reclamos
FOR EACH ROW
BEGIN
    UPDATE reclamos
    SET monto_total = (
        SELECT COALESCE(SUM(monto_soles), 0)
        FROM detalle_reclamos
        WHERE reclamo_id = NEW.reclamo_id
    )
    WHERE id = NEW.reclamo_id;
END //

-- TRIGGER: Recalcular monto total del reclamo al eliminar detalle
CREATE TRIGGER trg_detalle_delete_recalcula_total
AFTER DELETE ON detalle_reclamos
FOR EACH ROW
BEGIN
    UPDATE reclamos
    SET monto_total = (
        SELECT COALESCE(SUM(monto_soles), 0)
        FROM detalle_reclamos
        WHERE reclamo_id = OLD.reclamo_id
    )
    WHERE id = OLD.reclamo_id;
END //

DELIMITER ;

-- ============================================================
-- MIGRACIÓN: Tabla de adelantos a clientes
-- Fecha: 2026-03-19
-- ============================================================

USE asesoria_seguros;

CREATE TABLE IF NOT EXISTS adelantos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    fecha DATE NOT NULL,
    monto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    moneda CHAR(3) NOT NULL DEFAULT 'PEN' COMMENT 'PEN o USD',
    tipo_cambio DECIMAL(8,3) DEFAULT NULL COMMENT 'Tipo de cambio USD→PEN',
    monto_soles DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Monto convertido a soles',
    concepto VARCHAR(255) NOT NULL COMMENT 'Motivo del adelanto',
    observaciones TEXT DEFAULT NULL,
    evidencia LONGTEXT DEFAULT NULL COMMENT 'Evidencia en DataURL (base64)',
    creado_por VARCHAR(50) DEFAULT NULL,
    modificado_por VARCHAR(50) DEFAULT NULL,
    equipo_registro VARCHAR(255) DEFAULT NULL,
    fecha_creacion DATETIME DEFAULT NULL,
    fecha_modificacion DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_adelantos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_adelantos_cliente (cliente_id),
    INDEX idx_adelantos_fecha (fecha)
) ENGINE=InnoDB;

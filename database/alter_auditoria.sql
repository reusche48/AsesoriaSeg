-- ============================================================
-- ALTER: Agregar campos de auditoría a todas las tablas
-- Fecha: 2026-03-18
-- Campos: creado_por, modificado_por, equipo_registro, fecha_creacion, fecha_modificacion
-- ============================================================

USE asesoria_seguros;

-- CLIENTES
ALTER TABLE clientes
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL COMMENT 'Usuario que creó el registro',
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL COMMENT 'Último usuario que modificó',
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL COMMENT 'IP + User-Agent del equipo',
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL COMMENT 'Fecha/hora de creación',
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL COMMENT 'Fecha/hora última modificación';

-- BANCOS
ALTER TABLE bancos
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- SEGUROS
ALTER TABLE seguros
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- COBERTURAS
ALTER TABLE coberturas
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- CUENTAS BANCARIAS
ALTER TABLE cuentas_bancarias
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- TARJETAS
ALTER TABLE tarjetas
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- SINIESTROS
ALTER TABLE siniestros
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- RECLAMOS
ALTER TABLE reclamos
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- DETALLE RECLAMOS
ALTER TABLE detalle_reclamos
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- EVENTOS RECLAMO
ALTER TABLE eventos_reclamo
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- ROLES
ALTER TABLE roles
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- USUARIOS
ALTER TABLE usuarios
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

-- PERMISOS ROL
ALTER TABLE permisos_rol
    ADD COLUMN creado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN modificado_por VARCHAR(50) DEFAULT NULL,
    ADD COLUMN equipo_registro VARCHAR(255) DEFAULT NULL,
    ADD COLUMN fecha_creacion DATETIME DEFAULT NULL,
    ADD COLUMN fecha_modificacion DATETIME DEFAULT NULL;

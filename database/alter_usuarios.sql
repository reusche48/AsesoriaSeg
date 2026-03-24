-- ============================================================
-- Tablas de usuarios, roles y permisos
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(200) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
    id CHAR(36) NOT NULL PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    clave VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    rol_id CHAR(36) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuario_rol FOREIGN KEY (rol_id) REFERENCES roles(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permisos_rol (
    id CHAR(36) NOT NULL PRIMARY KEY,
    rol_id CHAR(36) NOT NULL,
    pantalla VARCHAR(50) NOT NULL COMMENT 'Nombre de la sección/pantalla',
    acceso TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=tiene acceso, 0=no',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_permiso_rol FOREIGN KEY (rol_id) REFERENCES roles(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_rol_pantalla (rol_id, pantalla)
) ENGINE=InnoDB;

-- ============================================================
-- Datos iniciales: Rol admin con acceso total
-- ============================================================

INSERT INTO roles (id, nombre, descripcion) VALUES
    (UUID(), 'Administrador', 'Acceso total al sistema');

SET @admin_rol_id = (SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1);

-- Permisos para todas las pantallas
INSERT INTO permisos_rol (id, rol_id, pantalla, acceso) VALUES
    (UUID(), @admin_rol_id, 'clientes', 1),
    (UUID(), @admin_rol_id, 'bancos', 1),
    (UUID(), @admin_rol_id, 'tarjetas', 1),
    (UUID(), @admin_rol_id, 'seguros', 1),
    (UUID(), @admin_rol_id, 'coberturas', 1),
    (UUID(), @admin_rol_id, 'siniestros', 1),
    (UUID(), @admin_rol_id, 'reclamos', 1),
    (UUID(), @admin_rol_id, 'eventos', 1),
    (UUID(), @admin_rol_id, 'pendientes', 1),
    (UUID(), @admin_rol_id, 'seguimiento', 1),
    (UUID(), @admin_rol_id, 'alertas', 1),
    (UUID(), @admin_rol_id, 'usuarios', 1);

-- Usuario admin por defecto (clave: admin123)
INSERT INTO usuarios (id, usuario, clave, nombre_completo, rol_id, activo) VALUES
    (UUID(), 'admin', 'admin123', 'Administrador del Sistema', @admin_rol_id, 1);

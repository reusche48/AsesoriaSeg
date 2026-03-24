-- ============================================================
-- ALTER: Agregar campos de plazo de vencimiento a eventos_reclamo
-- ============================================================

ALTER TABLE eventos_reclamo
    ADD COLUMN dias_espera INT DEFAULT NULL COMMENT 'Días de espera para respuesta' AFTER evidencia,
    ADD COLUMN tipo_dias VARCHAR(15) DEFAULT NULL COMMENT 'naturales o laborables' AFTER dias_espera,
    ADD COLUMN fecha_vencimiento DATE DEFAULT NULL COMMENT 'Fecha límite calculada' AFTER tipo_dias,
    ADD COLUMN evento_origen_id CHAR(36) DEFAULT NULL COMMENT 'ID del evento origen si es seguimiento' AFTER fecha_vencimiento,
    ADD INDEX idx_eventos_vencimiento (fecha_vencimiento),
    ADD CONSTRAINT fk_evento_origen FOREIGN KEY (evento_origen_id) REFERENCES eventos_reclamo(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

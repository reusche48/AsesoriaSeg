-- ============================================================
-- ALTER: Agregar campos moneda, tipo_cambio, monto_soles
-- a la tabla detalle_reclamos
-- ============================================================

ALTER TABLE detalle_reclamos
    ADD COLUMN moneda CHAR(3) NOT NULL DEFAULT 'PEN' COMMENT 'PEN o USD' AFTER monto,
    ADD COLUMN tipo_cambio DECIMAL(8,3) DEFAULT NULL COMMENT 'Tipo de cambio USD→PEN' AFTER moneda,
    ADD COLUMN monto_soles DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Monto convertido a soles' AFTER tipo_cambio;

-- Actualizar registros existentes: monto_soles = monto (todos eran PEN)
UPDATE detalle_reclamos SET monto_soles = monto WHERE monto_soles = 0;

-- ============================================================
-- Recrear triggers para sumar monto_soles en vez de monto
-- ============================================================

DROP TRIGGER IF EXISTS trg_detalle_insert_recalcula_total;
DROP TRIGGER IF EXISTS trg_detalle_update_recalcula_total;
DROP TRIGGER IF EXISTS trg_detalle_delete_recalcula_total;

DELIMITER //

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

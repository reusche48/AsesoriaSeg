-- Agregar columna evidencia_seguro y numero_cci a tarjetas
ALTER TABLE tarjetas ADD COLUMN evidencia_seguro LONGTEXT NULL AFTER activo;
ALTER TABLE tarjetas ADD COLUMN numero_cci VARCHAR(20) NULL AFTER numero_cuenta;

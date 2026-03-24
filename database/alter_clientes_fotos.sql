-- Agregar columnas de foto DNI a tabla clientes
USE asesoria_seguros;

ALTER TABLE clientes
    ADD COLUMN dni_frontal LONGTEXT DEFAULT NULL COMMENT 'Foto DNI frontal en DataURL (base64)' AFTER email2,
    ADD COLUMN dni_posterior LONGTEXT DEFAULT NULL COMMENT 'Foto DNI posterior en DataURL (base64)' AFTER dni_frontal;

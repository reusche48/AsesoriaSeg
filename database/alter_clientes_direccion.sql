-- ============================================================
-- MIGRACIÓN: Agregar dirección y GPS a clientes
-- Fecha: 2026-03-19
-- ============================================================

USE asesoria_seguros;

ALTER TABLE clientes
    ADD COLUMN direccion VARCHAR(300) DEFAULT NULL COMMENT 'Dirección del domicilio' AFTER email2,
    ADD COLUMN gps_latitud DECIMAL(10,7) DEFAULT NULL COMMENT 'Latitud GPS' AFTER direccion,
    ADD COLUMN gps_longitud DECIMAL(10,7) DEFAULT NULL COMMENT 'Longitud GPS' AFTER gps_latitud;

-- Agregar campo observaciones a la tabla de clientes
ALTER TABLE clientes ADD COLUMN observaciones TEXT NULL AFTER gps_longitud;

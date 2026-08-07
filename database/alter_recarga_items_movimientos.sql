-- Movimientos internos y salidas a terceros dentro de una recarga.
--
-- tipo:
--   'ingreso' (por defecto) -> dinero que ENTRA a banco_id. Suma al total.
--   'interno'               -> traslado banco_id (origen) -> banco_destino_id (destino).
--                              NO cambia el total: solo reparte entre bancos.
--   'salida'                -> dinero que sale de banco_id hacia un tercero
--                              (banco de otra persona). RESTA del total por justificar;
--                              por eso NO debe registrarse además como gasto en el cuadre.
--
-- monto siempre positivo: el signo lo define el tipo (ver deltasDeItem en rechargeService.js).
-- El DEFAULT 'ingreso' hace que las filas existentes conserven su comportamiento actual.

ALTER TABLE recarga_items
  ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'ingreso' AFTER banco_id,
  ADD COLUMN banco_destino_id VARCHAR(64) NULL AFTER tipo,
  ADD COLUMN destino_detalle VARCHAR(255) NULL AFTER banco_destino_id;

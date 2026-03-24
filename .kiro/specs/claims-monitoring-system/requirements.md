# Documento de Requisitos - Sistema de Monitoreo de Reclamos

## Introducción

Sistema de monitoreo de reclamos para una aseguradora que permite registrar clientes, gestionar sus cuentas bancarias y tarjetas aseguradas, registrar siniestros con denuncias policiales, crear reclamos vinculados a siniestros con detalle de coberturas y montos, y realizar seguimiento de eventos asociados a cada reclamo.

## Glosario

- **Sistema_Monitoreo**: Sistema principal de monitoreo de reclamos de la aseguradora
- **Cliente**: Persona registrada en el sistema que posee cuentas bancarias y puede presentar reclamos
- **DNI**: Documento Nacional de Identidad del cliente, compuesto por 8 dígitos más un noveno dígito verificador
- **Banco**: Entidad bancaria en la cual el cliente posee cuentas
- **Cuenta_Bancaria**: Cuenta que un cliente posee en un banco, denominada en Soles (PEN) o Dólares (USD)
- **Tarjeta**: Instrumento financiero asociado a una o más cuentas bancarias
- **Seguro**: Póliza de seguro que puede ser asignada a una tarjeta, con coberturas específicas
- **Cobertura**: Tipo específico de protección incluida dentro de un seguro
- **Siniestro**: Evento adverso reportado por un cliente que incluye una denuncia policial y puede generar múltiples reclamos
- **Denuncia_Policial**: Documento adjunto al siniestro en formato PDF o imagen
- **Reclamo**: Solicitud formal de indemnización vinculada a un siniestro y a una entidad bancaria
- **Detalle_Reclamo**: Línea dentro de un reclamo que especifica una cobertura y el monto reclamado
- **Evento_Reclamo**: Registro de seguimiento asociado a un reclamo que documenta el avance del proceso
- **Evidencia**: Archivo adjunto que respalda un reclamo, detalle de reclamo o evento

## Requisitos

### Requisito 1: Registro de Cliente

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar los datos de un cliente, para poder gestionar sus reclamos y siniestros.

#### Criterios de Aceptación

1. THE Sistema_Monitoreo SHALL permitir registrar un Cliente con los siguientes campos: nombre completo, apellidos completos, DNI, fecha de nacimiento, teléfono 1, teléfono 2, correo electrónico 1 y correo electrónico 2.
2. WHEN un operador registra un Cliente, THE Sistema_Monitoreo SHALL requerir obligatoriamente el nombre completo, los apellidos completos y el DNI.
3. WHEN un operador registra un Cliente, THE Sistema_Monitoreo SHALL permitir que los campos fecha de nacimiento, teléfono 1, teléfono 2, correo electrónico 1 y correo electrónico 2 sean opcionales.
4. WHEN un operador ingresa un DNI, THE Sistema_Monitoreo SHALL validar que el DNI contenga exactamente 8 dígitos más un noveno dígito verificador.
5. IF un operador ingresa un DNI con un dígito verificador inválido, THEN THE Sistema_Monitoreo SHALL mostrar un mensaje de error indicando que el dígito verificador es incorrecto.
6. IF un operador intenta registrar un Cliente con un DNI ya existente, THEN THE Sistema_Monitoreo SHALL mostrar un mensaje de error indicando que el Cliente ya se encuentra registrado.

### Requisito 2: Gestión de Bancos y Cuentas Bancarias

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar los bancos y cuentas bancarias de un cliente, para poder vincular sus tarjetas y seguros a entidades bancarias específicas.

#### Criterios de Aceptación

1. THE Sistema_Monitoreo SHALL permitir asociar uno o más Bancos a un Cliente.
2. THE Sistema_Monitoreo SHALL permitir registrar múltiples Cuentas Bancarias de un mismo Banco para un mismo Cliente.
3. WHEN un operador registra una Cuenta_Bancaria, THE Sistema_Monitoreo SHALL requerir la selección de la moneda como Soles (PEN) o Dólares (USD).
4. THE Sistema_Monitoreo SHALL permitir que los campos de Banco y Cuenta_Bancaria sean opcionales en el registro del Cliente.

### Requisito 3: Gestión de Tarjetas

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar las tarjetas asociadas a las cuentas bancarias de un cliente, para poder gestionar los seguros vinculados.

#### Criterios de Aceptación

1. THE Sistema_Monitoreo SHALL permitir asociar una Tarjeta a una o más Cuentas Bancarias del mismo Cliente.
2. THE Sistema_Monitoreo SHALL permitir que una Tarjeta exista sin un Seguro asignado.
3. THE Sistema_Monitoreo SHALL permitir asignar un único Seguro a cada Tarjeta.
4. IF un operador intenta asignar más de un Seguro a una misma Tarjeta, THEN THE Sistema_Monitoreo SHALL mostrar un mensaje de error indicando que la Tarjeta ya posee un Seguro asignado.

### Requisito 4: Regla de Aseguramiento por Banco

**Historia de Usuario:** Como operador de la aseguradora, quiero que al asegurar una tarjeta de un banco, todas las tarjetas de ese mismo banco queden aseguradas, para garantizar cobertura uniforme por entidad bancaria.

#### Criterios de Aceptación

1. WHEN un operador asigna un Seguro a una Tarjeta de un Banco específico, THE Sistema_Monitoreo SHALL asignar automáticamente el mismo Seguro a todas las demás Tarjetas del mismo Banco pertenecientes al mismo Cliente.
2. WHEN el Sistema_Monitoreo aplica el aseguramiento automático por Banco, THE Sistema_Monitoreo SHALL notificar al operador la cantidad de Tarjetas adicionales aseguradas.
3. IF una Tarjeta del mismo Banco ya posee un Seguro diferente al que se está asignando, THEN THE Sistema_Monitoreo SHALL solicitar confirmación al operador antes de reemplazar el Seguro existente.

### Requisito 5: Gestión de Seguros y Coberturas

**Historia de Usuario:** Como operador de la aseguradora, quiero gestionar los seguros y sus coberturas, para poder asociarlos a las tarjetas de los clientes.

#### Criterios de Aceptación

1. THE Sistema_Monitoreo SHALL permitir registrar un Seguro con un nombre, una descripción y una lista de Coberturas.
2. THE Sistema_Monitoreo SHALL permitir que un Seguro contenga una o más Coberturas.
3. THE Sistema_Monitoreo SHALL permitir que existan diferentes Seguros con diferentes Coberturas disponibles para una misma Tarjeta.
4. WHEN un operador consulta un Seguro, THE Sistema_Monitoreo SHALL mostrar la lista completa de Coberturas asociadas a dicho Seguro.

### Requisito 6: Registro de Siniestro

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar un siniestro asociado a un cliente, para documentar el evento adverso y poder generar reclamos a partir de este.

#### Criterios de Aceptación

1. WHEN un operador registra un Siniestro, THE Sistema_Monitoreo SHALL requerir la búsqueda y selección de un Cliente existente.
2. WHEN un operador registra un Siniestro, THE Sistema_Monitoreo SHALL requerir la fecha del siniestro.
3. WHEN un operador registra un Siniestro, THE Sistema_Monitoreo SHALL requerir el adjunto de la Denuncia_Policial en formato PDF o imagen (JPG, PNG).
4. WHEN un operador registra un Siniestro, THE Sistema_Monitoreo SHALL requerir la descripción de la denuncia policial en texto plano.
5. IF un operador adjunta un archivo de Denuncia_Policial en un formato diferente a PDF, JPG o PNG, THEN THE Sistema_Monitoreo SHALL mostrar un mensaje de error indicando los formatos permitidos.
6. THE Sistema_Monitoreo SHALL permitir que un Cliente tenga múltiples Siniestros registrados.

### Requisito 7: Búsqueda de Cliente

**Historia de Usuario:** Como operador de la aseguradora, quiero buscar un cliente en el sistema, para poder registrarle siniestros y reclamos.

#### Criterios de Aceptación

1. THE Sistema_Monitoreo SHALL permitir buscar un Cliente por DNI o por nombre completo.
2. WHEN un operador busca un Cliente por DNI, THE Sistema_Monitoreo SHALL mostrar el resultado exacto que coincida con el DNI ingresado.
3. WHEN un operador busca un Cliente por nombre, THE Sistema_Monitoreo SHALL mostrar una lista de Clientes cuyos nombres coincidan parcialmente con el texto ingresado.
4. IF la búsqueda no encuentra ningún Cliente, THEN THE Sistema_Monitoreo SHALL mostrar un mensaje indicando que no se encontraron resultados.

### Requisito 8: Registro de Reclamo

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar un reclamo vinculado a un siniestro, para formalizar la solicitud de indemnización ante una entidad bancaria.

#### Criterios de Aceptación

1. WHEN un operador registra un Reclamo, THE Sistema_Monitoreo SHALL requerir la selección de un Siniestro previamente registrado.
2. WHEN un operador registra un Reclamo, THE Sistema_Monitoreo SHALL requerir la selección de una entidad bancaria (Banco) vinculada al Cliente del Siniestro.
3. WHEN un operador registra un Reclamo, THE Sistema_Monitoreo SHALL requerir la fecha del reclamo.
4. WHEN un operador registra un Reclamo, THE Sistema_Monitoreo SHALL permitir ingresar observaciones relacionadas con el reclamo.
5. WHEN un operador registra un Reclamo, THE Sistema_Monitoreo SHALL permitir adjuntar un archivo de Evidencia de cualquier formato.
6. THE Sistema_Monitoreo SHALL permitir registrar múltiples Reclamos dentro de un mismo Siniestro.

### Requisito 9: Detalle del Reclamo y Coberturas

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar el detalle de un reclamo seleccionando coberturas y montos, para especificar los conceptos y valores de la indemnización solicitada.

#### Criterios de Aceptación

1. WHEN un operador registra un Detalle_Reclamo, THE Sistema_Monitoreo SHALL mostrar únicamente las Coberturas del Seguro asociado al Banco seleccionado en el Reclamo.
2. WHEN un operador registra un Detalle_Reclamo, THE Sistema_Monitoreo SHALL requerir la selección de una Cobertura y el ingreso del monto a reclamar.
3. THE Sistema_Monitoreo SHALL permitir registrar uno o más Detalles de Reclamo dentro de un mismo Reclamo.
4. WHEN se agregan o modifican Detalles de Reclamo, THE Sistema_Monitoreo SHALL calcular automáticamente el monto total del Reclamo como la suma de los montos de todos los Detalles de Reclamo asociados.
5. THE Sistema_Monitoreo SHALL almacenar el monto total calculado en el campo monto total del Reclamo.
6. WHEN un operador registra un Detalle_Reclamo, THE Sistema_Monitoreo SHALL permitir adjuntar un archivo de Evidencia al detalle.

### Requisito 10: Seguimiento de Eventos del Reclamo

**Historia de Usuario:** Como operador de la aseguradora, quiero registrar eventos de seguimiento en un reclamo, para monitorear el avance del proceso de indemnización.

#### Criterios de Aceptación

1. WHEN un operador registra un Evento_Reclamo, THE Sistema_Monitoreo SHALL requerir la selección de un Reclamo existente.
2. WHEN un operador registra un Evento_Reclamo, THE Sistema_Monitoreo SHALL requerir el ingreso de la fecha del evento.
3. WHEN un operador registra un Evento_Reclamo, THE Sistema_Monitoreo SHALL requerir el ingreso de una descripción del evento.
4. WHEN un operador registra un Evento_Reclamo, THE Sistema_Monitoreo SHALL permitir adjuntar un archivo de Evidencia.
5. THE Sistema_Monitoreo SHALL permitir registrar múltiples Eventos de Reclamo para un mismo Reclamo.
6. WHEN un operador consulta los Eventos de un Reclamo, THE Sistema_Monitoreo SHALL mostrar la lista de Eventos ordenados cronológicamente por fecha del evento.

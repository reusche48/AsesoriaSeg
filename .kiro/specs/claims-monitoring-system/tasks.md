# Plan de Implementación: Sistema de Monitoreo de Reclamos

## Visión General

Implementación incremental de una SPA con JavaScript vanilla y persistencia en localStorage. Se construye desde la capa de datos (storage adapter, repositorios) hacia la capa de lógica de negocio (validadores, servicios) y finalmente la capa de presentación (módulos UI), conectando todo en el punto de entrada principal.

## Tareas

- [x] 1. Configurar estructura del proyecto y capa de almacenamiento
  - [x] 1.1 Crear estructura de directorios y archivos base del proyecto
    - Crear `index.html` con estructura SPA base (contenedor principal, navegación entre secciones)
    - Crear `styles.css` con estilos base para formularios, tablas, mensajes de error y navegación
    - Crear directorios: `src/validators/`, `src/services/`, `src/repositories/`, `src/ui/`, `src/tests/`
    - _Requisitos: Todos (estructura base)_

  - [x] 1.2 Implementar el adaptador de almacenamiento (`src/storage.js`)
    - Implementar `getCollection(key)` que retorna un array parseado desde localStorage
    - Implementar `saveCollection(key, data)` que serializa y guarda en localStorage
    - Implementar `generateId()` que genera un UUID v4 simple
    - Manejar errores de localStorage (QuotaExceededError, no disponible)
    - _Requisitos: Todos (persistencia base)_

  - [x] 1.3 Implementar la interfaz genérica de repositorio (`src/repositories/baseRepository.js`)
    - Implementar métodos: `getAll()`, `getById(id)`, `save(entity)`, `update(id, data)`, `delete(id)`, `findBy(predicate)`
    - Usar `storage.js` como capa de acceso a localStorage
    - Cada repositorio concreto extiende esta base con su clave de colección
    - _Requisitos: Todos (acceso a datos base)_

- [x] 2. Implementar validadores
  - [x] 2.1 Implementar validador de DNI (`src/validators/dniValidator.js`)
    - Implementar algoritmo de dígito verificador con factores `[3, 2, 7, 6, 5, 4, 3, 2]`
    - Implementar mapeo de diferencia a dígito verificador (numérico y letra)
    - Implementar `validateDNI(dni)` que retorna `{ valid, error? }`
    - Validar que el DNI tenga exactamente 9 caracteres (8 dígitos + verificador)
    - _Requisitos: 1.4, 1.5_

  - [x] 2.2 Escribir test de propiedad para validación de DNI
    - **Propiedad 1: Validación del DNI — round trip del dígito verificador**
    - **Valida: Requisitos 1.4, 1.5**

  - [x] 2.3 Implementar validadores generales (`src/validators/validators.js`)
    - Implementar `validateRequired(fields, requiredKeys)` que retorna `{ valid, errors[] }`
    - Implementar `validateEmail(email)` que retorna `{ valid, error? }`
    - Implementar `validatePoliceReportFile(file)` que acepta solo PDF, JPG, PNG
    - _Requisitos: 1.2, 1.3, 6.3, 6.5_

  - [x] 2.4 Escribir test de propiedad para validación de formato de denuncia policial
    - **Propiedad 12: Validación de formato de denuncia policial**
    - **Valida: Requisitos 6.3, 6.5**

- [x] 3. Implementar servicios de dominio — Cliente y Búsqueda
  - [x] 3.1 Implementar `ClientRepository` (`src/repositories/clientRepository.js`)
    - Extender `baseRepository` con clave de colección `'clients'`
    - Agregar método `findByDNI(dni)` para búsqueda exacta
    - Agregar método `searchByName(name)` para búsqueda parcial case-insensitive
    - _Requisitos: 1.1, 7.1, 7.2, 7.3_

  - [x] 3.2 Implementar `clientService.js` (`src/services/clientService.js`)
    - Implementar `registerClient(clientData)` con validación de DNI, campos requeridos y unicidad
    - Implementar `findClientByDNI(dni)` para búsqueda exacta
    - Implementar `searchClientsByName(name)` para búsqueda parcial case-insensitive
    - Retornar errores descriptivos en español según formato `{ field, code, message }`
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.1, 7.2, 7.3, 7.4_

  - [x] 3.3 Escribir tests de propiedad para Cliente
    - **Propiedad 2: Campos requeridos del Cliente**
    - **Propiedad 3: Unicidad del DNI**
    - **Propiedad 4: Persistencia round-trip del Cliente**
    - **Valida: Requisitos 1.1, 1.2, 1.3, 1.6**

  - [x] 3.4 Escribir tests de propiedad para Búsqueda de Cliente
    - **Propiedad 14: Búsqueda exacta por DNI**
    - **Propiedad 15: Búsqueda parcial por nombre**
    - **Valida: Requisitos 7.2, 7.3**

- [x] 4. Checkpoint — Verificar capa base
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [-] 5. Implementar servicios de dominio — Bancos, Cuentas y Tarjetas
  - [x] 5.1 Implementar repositorios de Banco, CuentaBancaria y Tarjeta
    - Crear `src/repositories/bankRepository.js` con clave `'banks'`
    - Crear `src/repositories/bankAccountRepository.js` con clave `'bankAccounts'`
    - Crear `src/repositories/cardRepository.js` con clave `'cards'`
    - _Requisitos: 2.1, 2.2, 3.1_

  - [x] 5.2 Implementar `bankService.js` (`src/services/bankService.js`)
    - Implementar `addBankToClient(clientId, bankData)` — asociar banco a cliente
    - Implementar `addBankAccount(clientId, bankId, currency)` — validar moneda PEN/USD
    - _Requisitos: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.3 Escribir test de propiedad para moneda de cuenta bancaria
    - **Propiedad 5: Moneda de cuenta bancaria restringida a PEN/USD**
    - **Valida: Requisito 2.3**

  - [x] 5.4 Implementar `cardService.js` (`src/services/cardService.js`)
    - Implementar `addCard(clientId, accountIds)` — validar que todas las cuentas pertenezcan al mismo cliente
    - Implementar `assignInsurance(cardId, insuranceId)` — con regla de auto-aseguramiento por banco
    - Detectar conflictos de seguro existente y retornar lista de conflictos para confirmación
    - Retornar `{ card, autoInsuredCards }` con conteo de tarjetas adicionales aseguradas
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_

  - [x] 5.5 Escribir tests de propiedad para Tarjetas y Seguros
    - **Propiedad 7: Restricción de un seguro por tarjeta**
    - **Propiedad 8: Auto-aseguramiento por banco**
    - **Propiedad 9: Detección de conflictos en auto-aseguramiento**
    - **Propiedad 22: Asociación de tarjeta a cuentas del mismo cliente**
    - **Valida: Requisitos 3.1, 3.4, 4.1, 4.2, 4.3**

  - [x] 5.6 Escribir test de propiedad para multiplicidad de entidades
    - **Propiedad 6: Multiplicidad de entidades asociadas**
    - **Valida: Requisitos 2.1, 2.2, 6.6, 8.6, 9.3, 10.5**

- [x] 6. Implementar servicios de dominio — Seguros y Coberturas
  - [x] 6.1 Implementar repositorios de Seguro y Cobertura
    - Crear `src/repositories/insuranceRepository.js` con clave `'insurances'`
    - Crear `src/repositories/coverageRepository.js` con clave `'coverages'`
    - _Requisitos: 5.1, 5.2_

  - [x] 6.2 Implementar `insuranceService.js` (`src/services/insuranceService.js`)
    - Implementar `createInsurance(name, description, coverages)` — validar al menos una cobertura
    - Implementar `getInsuranceWithCoverages(insuranceId)` — retornar seguro con lista completa de coberturas
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.3 Escribir tests de propiedad para Seguros
    - **Propiedad 10: Seguro debe contener al menos una cobertura**
    - **Propiedad 11: Round-trip de seguro con coberturas**
    - **Valida: Requisitos 5.1, 5.2, 5.4**

- [x] 7. Checkpoint — Verificar servicios de dominio
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [-] 8. Implementar servicios de dominio — Siniestros, Reclamos y Eventos
  - [x] 8.1 Implementar repositorios de Siniestro, Reclamo, DetalleReclamo y EventoReclamo
    - Crear `src/repositories/incidentRepository.js` con clave `'incidents'`
    - Crear `src/repositories/claimRepository.js` con clave `'claims'`
    - Crear `src/repositories/claimDetailRepository.js` con clave `'claimDetails'`
    - Crear `src/repositories/claimEventRepository.js` con clave `'claimEvents'`
    - _Requisitos: 6.1, 8.1, 9.1, 10.1_

  - [x] 8.2 Implementar `incidentService.js` (`src/services/incidentService.js`)
    - Implementar `createIncident(clientId, date, policeReport)` — validar cliente existente, fecha, archivo y descripción
    - Convertir archivo de denuncia policial a DataURL para almacenamiento
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 8.3 Escribir test de propiedad para campos requeridos del siniestro
    - **Propiedad 13: Campos requeridos del siniestro**
    - **Valida: Requisitos 6.1, 6.2, 6.3, 6.4**

  - [x] 8.4 Implementar `claimService.js` (`src/services/claimService.js`)
    - Implementar `createClaim(incidentId, bankId, date, observations?, evidence?)` — validar siniestro existente y banco vinculado al cliente
    - Implementar `addClaimDetail(claimId, coverageId, amount, evidence?)` — validar cobertura y monto requeridos
    - Implementar `updateClaimDetail(claimDetailId, coverageId, amount, evidence?)` — recalcular total
    - Implementar `calculateClaimTotal(claimId)` — suma de montos de todos los detalles
    - Implementar `getAvailableCoverages(claimId)` — filtrar coberturas según seguro del banco del reclamo
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 8.5 Escribir tests de propiedad para Reclamos
    - **Propiedad 16: Validación de reclamo vinculado a banco del cliente**
    - **Propiedad 17: Filtrado de coberturas por banco del reclamo**
    - **Propiedad 18: Cálculo automático del monto total del reclamo**
    - **Propiedad 19: Campos requeridos del detalle de reclamo**
    - **Valida: Requisitos 8.1, 8.2, 8.3, 9.1, 9.2, 9.4, 9.5**

  - [x] 8.6 Implementar `claimEventService.js` (`src/services/claimEventService.js`)
    - Implementar `addClaimEvent(claimId, date, description, evidence?)` — validar campos requeridos
    - Implementar `getClaimEvents(claimId)` — retornar eventos ordenados cronológicamente por fecha ascendente
    - _Requisitos: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 8.7 Escribir tests de propiedad para Eventos de Reclamo
    - **Propiedad 20: Campos requeridos del evento de reclamo**
    - **Propiedad 21: Ordenamiento cronológico de eventos**
    - **Valida: Requisitos 10.1, 10.2, 10.3, 10.6**

- [x] 9. Checkpoint — Verificar toda la lógica de negocio
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 10. Implementar capa de presentación — Cliente y Búsqueda
  - [x] 10.1 Implementar `clientUI.js` (`src/ui/clientUI.js`)
    - Renderizar formulario de registro de cliente con todos los campos (requeridos y opcionales)
    - Mostrar mensajes de error de validación junto a cada campo
    - Mantener datos del formulario en caso de error (sin pérdida de datos)
    - Implementar búsqueda por DNI (resultado exacto) y por nombre (lista de coincidencias parciales)
    - Mostrar mensaje "No se encontraron resultados" cuando la búsqueda no retorna clientes
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.1, 7.2, 7.3, 7.4_

- [x] 11. Implementar capa de presentación — Bancos, Cuentas, Tarjetas y Seguros
  - [x] 11.1 Implementar `bankUI.js` (`src/ui/bankUI.js`)
    - Renderizar formulario para asociar bancos a un cliente
    - Renderizar formulario para registrar cuentas bancarias con selector de moneda (PEN/USD)
    - Mostrar lista de bancos y cuentas del cliente seleccionado
    - _Requisitos: 2.1, 2.2, 2.3, 2.4_

  - [x] 11.2 Implementar `cardUI.js` (`src/ui/cardUI.js`)
    - Renderizar formulario para asociar tarjetas a cuentas bancarias
    - Implementar asignación de seguro a tarjeta con notificación de auto-aseguramiento
    - Mostrar diálogo de confirmación cuando hay conflictos de seguro existente
    - Mostrar cantidad de tarjetas adicionales aseguradas automáticamente
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_

  - [x] 11.3 Implementar `insuranceUI.js` (`src/ui/insuranceUI.js`)
    - Renderizar formulario para crear seguros con nombre, descripción y lista de coberturas
    - Permitir agregar múltiples coberturas al seguro
    - Mostrar lista de seguros con sus coberturas al consultar
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

- [x] 12. Implementar capa de presentación — Siniestros, Reclamos y Eventos
  - [x] 12.1 Implementar `incidentUI.js` (`src/ui/incidentUI.js`)
    - Renderizar formulario de registro de siniestro con búsqueda y selección de cliente
    - Implementar carga de archivo de denuncia policial con validación de formato (PDF, JPG, PNG)
    - Convertir archivo a DataURL para almacenamiento
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 12.2 Implementar `claimUI.js` (`src/ui/claimUI.js`)
    - Renderizar formulario de registro de reclamo con selección de siniestro y banco
    - Implementar sección de detalles de reclamo con selector de coberturas filtradas por banco
    - Mostrar monto total calculado automáticamente al agregar/modificar detalles
    - Permitir adjuntar evidencias al reclamo y a cada detalle
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 12.3 Implementar `claimEventUI.js` (`src/ui/claimEventUI.js`)
    - Renderizar formulario de registro de evento con selección de reclamo
    - Mostrar lista de eventos ordenados cronológicamente
    - Permitir adjuntar evidencia al evento
    - _Requisitos: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 13. Integración y punto de entrada principal
  - [x] 13.1 Implementar navegación SPA y conectar todos los módulos (`src/app.js`)
    - Implementar sistema de navegación SPA con hash routing entre secciones
    - Conectar todos los módulos UI al contenedor principal de `index.html`
    - Inicializar todos los servicios y repositorios al cargar la aplicación
    - Vincular `index.html` con `app.js` y todos los módulos
    - _Requisitos: Todos_

  - [x] 13.2 Escribir tests de integración para flujos completos
    - Test de flujo: Registro de cliente → Agregar banco y cuentas → Agregar tarjeta → Asignar seguro con auto-aseguramiento
    - Test de flujo: Registro de siniestro → Crear reclamo → Agregar detalles con coberturas → Verificar monto total
    - Test de flujo: Crear reclamo → Agregar eventos → Verificar orden cronológico
    - _Requisitos: Todos_

- [x] 14. Checkpoint final — Verificar integración completa
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia los requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los tests de propiedad validan propiedades universales de correctitud
- Los tests unitarios validan ejemplos específicos y casos borde
- Se usa Vitest + fast-check como framework de testing

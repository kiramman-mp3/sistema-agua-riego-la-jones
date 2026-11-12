# Plan de implementación: pantallas para las funciones que solo existen por API

Cinco operaciones existen y están probadas en el servidor, pero la directiva no las puede usar porque no tienen pantalla (ver [`../OBSERVACIONES.md`](../OBSERVACIONES.md), sección 1). Este plan agrega esas pantallas reutilizando los endpoints actuales. Base: `develop` después de `v1.3.0`.

## Resumen

| # | Función | Dónde va en la interfaz | Cambios en el servidor | Horas |
|---|---|---|---|---|
| 1 | Quitar la verificación en dos pasos de otra cuenta | Padrón → editar usuario → "Cuenta de acceso web" | Exponer `totp_activo` en el detalle de la persona | 2 |
| 2 | Eliminar un usuario registrado por error | Padrón → editar usuario → zona de peligro | Ninguno (ya valida que no tenga historial) | 2 |
| 3 | Crear, editar y desactivar sectores | Catastro de lotes → botón "Sectores" | Auditoría de sectores dentro de la transacción | 4 |
| 4 | Anular un egreso | Cobros y pagos → Egresos → acción por fila | Filtro por estado en la lista (el estado y el motivo ya se devuelven) | 3 |
| 5 | Exonerar (anular) una obligación y crear una multa manual | Cobros y pagos → Cobrar → usuario elegido | Ninguno (endpoints existentes) | 5 |
| — | Pruebas E2E, guía de usuario y documentación | — | — | 3 |
| | **Total** | | | **19 h** |

Cada función va en su propia rama `feature/*` desde `develop`, con commits pequeños en inglés, pruebas unitarias del componente, prueba de integración si cambia el servidor y una prueba E2E del flujo. Al terminar todas: rama `docs/*` con la guía, el inventario y las observaciones actualizados, y etiqueta `v1.4.0` con la CI en verde.

---

## 1. Quitar la verificación en dos pasos de otra cuenta

- **Para qué:** un administrador que perdió el teléfono y sus códigos de recuperación queda fuera. Hoy solo se resuelve con `npm run db:reset-admin` en el servidor.
- **Endpoint existente:** `POST /api/personas/:id/cuenta/totp/desactivar` (solo ADMIN, no la propia cuenta, queda en la auditoría).
- **Servidor:** agregar `c.totp_activo` al `SELECT` de `getPersonaById` (`backend/src/controllers/personaController.js`).
- **Interfaz:**
  - `admin.service.ts`: método `quitarVerificacionDosPasos(personaId)`.
  - `usuario-form.component` (modo edición), sección **Cuenta de acceso web**: si `totp_activo`, mostrar "Verificación en dos pasos: activa" y el botón **Quitar verificación en dos pasos**, con confirmación ("La persona entrará solo con su contraseña hasta que la vuelva a activar"). No se muestra para la propia cuenta.
- **Pruebas:** unitaria del formulario (el botón aparece solo si está activa y no es la propia cuenta); la integración del endpoint ya existe (`totp.test.js`).
- **Criterio de aceptación:** tras quitarla, la persona ingresa solo con la contraseña y la auditoría muestra `segundoFactor: DESACTIVADO_POR_ADMIN`.

## 2. Eliminar un usuario registrado por error

- **Para qué:** borrar a alguien que se registró mal (cédula equivocada, duplicado) y nunca tuvo movimientos. Quien tenga historial se sigue inactivando.
- **Endpoint existente:** `DELETE /api/personas/:id`. Rechaza con 409 si tiene lotes, obligaciones, asistencias, turnos o pagos (el mensaje dice cuántos); no permite eliminarse a sí mismo; queda en la auditoría. Corregido en `v1.2.0` (antes fallaba siempre).
- **Interfaz:**
  - `admin.service.ts` ya tiene `deletePersona(id)`.
  - `usuario-form.component` (modo edición): al final, una zona separada **Eliminar del padrón** con el texto "Solo para registros hechos por error y sin ningún movimiento. Si la persona tiene historial, inactívela." y el botón **Eliminar usuario**.
  - Confirmación con el nombre y la cédula; si el servidor responde 409, mostrar su mensaje (con los conteos) y sugerir inactivar.
- **Pruebas:** unitaria (confirmación, manejo del 409); E2E: crear un usuario de prueba, eliminarlo, comprobar que no aparece en el padrón.
- **Criterio de aceptación:** un usuario sin movimientos desaparece del padrón; uno con movimientos muestra el motivo y sigue en el padrón.

## 3. Crear, editar y desactivar sectores

- **Contexto:** los sectores de la Junta (La Merced, Patate Viejo, San Javier) vienen cargados y hasta ahora se decidió que fueran fijos. El componente `sector-form.component.ts` y los métodos `createSector`, `updateSector` y `deleteSector` de `admin.service.ts` ya existen, pero ninguna pantalla los usa. **Confirmar con la Junta** que quiere administrar sectores desde el sistema.
- **Endpoints existentes:** `GET/POST /api/lotes/sectores`, `PUT/DELETE /api/lotes/sectores/:id`. Desactivar rechaza si el sector tiene lotes activos o turnos activos.
- **Servidor:** registrar la auditoría de crear, editar y desactivar sector dentro de una transacción, como el resto (`loteController.js`, `createSector`, `updateSector`, `deleteSector`).
- **Interfaz:**
  - En **Catastro de lotes**, botón **Sectores** que abre un modal con la lista (nombre, descripción, lotes, hectáreas) y acciones **Nuevo sector**, **Editar** y **Desactivar**, montando `SectorFormComponent`.
  - Desactivar pide confirmación y muestra el mensaje del servidor si tiene lotes o turnos.
  - Tras cualquier cambio, refrescar los filtros de sector del catastro, el padrón y los turnos.
- **Pruebas:** integración de la auditoría transaccional; unitaria del modal; E2E: crear un sector, verlo en el filtro del catastro, desactivarlo.
- **Criterio de aceptación:** un sector nuevo se puede elegir al registrar un lote; un sector con lotes no se puede desactivar.

## 4. Anular un egreso

- **Para qué:** corregir un egreso registrado por error. Hoy no se puede deshacer desde la pantalla.
- **Endpoint existente:** `POST /api/financiero/egresos/:id/anular` con `motivo` (mínimo 5 caracteres). Marca el egreso como `ANULADO` con fecha y responsable; no se borra.
- **Servidor:** `GET /api/financiero/egresos` ya devuelve `estado` y `motivo_anulacion` (`SELECT e.*` en `finanzasConsultas.listarEgresos`), y el balance y el historial ya cuentan solo los egresos `VIGENTE`. Falta agregar el filtro `estado` (vigentes / anulados / todos) a la lista.
- **Interfaz:**
  - `egresos.component`: columna **Estado**; acción **Anular** en los vigentes, con modal de motivo (el mismo patrón que anular un pago en el historial de recibos); filtro por estado.
  - `finanzas.service.ts` ya tiene `anularEgreso(id, motivo)`.
- **Pruebas:** unitaria del modal; integración del saldo sin anulados; E2E: registrar y anular un egreso y ver que el saldo de caja vuelve a su valor.
- **Criterio de aceptación:** el egreso anulado se ve tachado o con la etiqueta "Anulado", con su motivo, y no cuenta en los totales.

## 5. Exonerar una obligación y crear una multa manual

- **Para qué:** aplicar lo que decide la asamblea (por ejemplo, exonerar una multa o el agua de un año) y registrar una multa que no salió de un evento.
- **Endpoints existentes:**
  - `POST /api/financiero/obligaciones/:id/anular` (multas y otros) y `POST /api/financiero/agua-anual/obligaciones/:id/anular` (agua anual), ambos con `motivo`; solo anulan obligaciones **pendientes**.
  - `POST /api/financiero/obligaciones` crea una obligación manual de un concepto vigente. El agua anual no se puede crear así (se emite en Pago anual) y la cuota extraordinaria se retiró, así que en la práctica sirve para **multas manuales** (asamblea o minga).
- **Interfaz** (en **Cobros y pagos → Cobrar**, con el usuario elegido):
  - Junto a cada obligación pendiente, en las pestañas **Agua anual** y **Multas y otros**, una acción **Exonerar** con modal de motivo (por ejemplo, "Exonerado por asamblea del 12/11/2026").
  - Botón **Nueva multa manual**: concepto (multa de asamblea o de minga), valor (por defecto la tarifa vigente), fecha de emisión, período y observación.
  - `finanzas.service.ts` ya tiene `anularObligacionAnualAgua`; agregar `anularObligacion(id, motivo)` y `crearObligacionManual(datos)`.
- **Pruebas:** unitarias de los dos modales; E2E: crear una multa manual a un usuario, verla en "Mi cuenta" de ese usuario, exonerarla y comprobar que desaparece de sus pendientes; la auditoría registra ambas acciones.
- **Criterio de aceptación:** lo exonerado deja de sumar en el total pendiente del usuario y queda en la auditoría con el motivo.

---

## Orden recomendado

1. **Función 5** (exonerar y multa manual): es la que más afecta a la operación diaria de la caja.
2. **Función 4** (anular egreso): corrige errores de caja.
3. **Función 1** (quitar dos pasos de otro): evita depender del servidor si un directivo pierde el teléfono.
4. **Función 2** (eliminar usuario por error).
5. **Función 3** (sectores), solo si la Junta confirma que quiere administrarlos.

## Riesgos

- **Permisos:** las cinco son solo para ADMIN; si más adelante se implementan los niveles Presidente, Secretario y Tesorero (cotización, módulo 3.4), las funciones 4 y 5 pasan a ser de cobro y deben reservarse al Tesorero.
- **Datos financieros:** anular y exonerar no borran nada, pero cambian lo que la persona debe. Las confirmaciones deben mostrar el valor y el nombre antes de aceptar.

# Inventario funcional

Inventario de las funcionalidades del Sistema Integrado de Gestión de la Junta de Agua y Riego La Jones, versión `v1.3.0` (2026-11-13). Se construyó revisando las rutas y pantallas del frontend, los endpoints y reglas del backend y la base de datos, y se comprobó en el navegador con las cuentas de prueba. La guía para las personas usuarias está en [`GUIA_DE_USUARIO.md`](GUIA_DE_USUARIO.md); las inconsistencias, en [`OBSERVACIONES.md`](OBSERVACIONES.md).

## Roles

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| Visitante | Cualquier persona sin iniciar sesión | Ver el portal público: inicio, cronograma de turnos, comunicaciones (asambleas y mingas), noticias y aviso de privacidad |
| Usuario (`USUARIO`) | Socio o socia de la Junta con cuenta | Lo del visitante, más "Mi cuenta" (deudas, pagos, comprobantes) y "Mis lotes" (ubicación y turnos); ver actas firmadas |
| Administrador (`ADMIN`) | Integrante de la directiva | Todo lo anterior, más el panel de Gestión completo y la verificación en dos pasos de su cuenta |

## Estado de las funcionalidades

- **Operativa:** implementada, conectada entre pantalla y servidor, y comprobada (pruebas automáticas y/o navegador).
- **Parcial:** funciona con limitaciones descritas.
- **Solo API:** existe en el servidor pero no tiene pantalla.
- **No implementada:** se menciona en documentos o planes pero no existe.

## 1. Acceso y cuenta

| Funcionalidad | Rol | Ubicación | Datos | Resultado / validaciones | Estado |
|---|---|---|---|---|---|
| Iniciar sesión | Todos con cuenta | `/login` | Cédula, contraseña, "Recordar mi sesión" | ADMIN va a `/admin`, USUARIO a `/mi-cuenta`. Mensaje único ante error. Bloqueo de 15 min tras 5 fallos en 15 min desde la misma red | Operativa |
| Cambiar contraseña temporal | Todos con cuenta | `/login` (automático en el primer ingreso) | Contraseña temporal, nueva (2 veces) | Mínimo 10 caracteres, letras y números, sin la cédula, no común | Operativa |
| Recuperar contraseña | Todos | `/login` → "¿Olvidó su contraseña?" | — | Indica acudir a la secretaría; la directiva genera una temporal | Operativa (presencial) |
| Cerrar sesión | Todos con cuenta | Botón "Cerrar Sesión" | — | Cierra la sesión en todos los dispositivos | Operativa |
| Verificación en dos pasos | ADMIN | `/mi-cuenta` → "Verificación en dos pasos" | Aplicación de autenticación, código de 6 dígitos | Activar con QR, 8 códigos de recuperación, código pedido al ingresar, desactivar con contraseña | Operativa |
| Quitar la verificación de otra cuenta | ADMIN | — | — | `POST /api/personas/:id/cuenta/totp/desactivar` | Solo API |

## 2. Portal público

| Funcionalidad | Ubicación | Estado |
|---|---|---|
| Página de inicio (quiénes somos, misión, sectores, directiva, contacto, carrusel de noticias, próximos eventos) | `/` | Operativa |
| Cronograma de turnos por sector, en tarjetas o planilla, con impresión y PDF | `/` → "Ver cronograma de riego" | Operativa |
| Comunicaciones: asambleas y mingas próximas y pasadas, filtros por tipo, subtipo y sector, convocatoria PDF | `/eventos` | Operativa |
| Ver acta firmada de un evento | `/eventos` → "Ver Acta Firmada" | Operativa (requiere sesión) |
| Noticias: archivo con búsqueda, etiquetas y fechas; detalle | `/noticias/todas`, `/noticias/:id` | Operativa |
| Aviso de privacidad | `/privacidad` | Operativa |

## 3. Usuario: Mi cuenta

| Funcionalidad | Ubicación | Estado |
|---|---|---|
| Total pendiente y estado (al día / valores pendientes) | `/mi-cuenta` | Operativa |
| Obligaciones pendientes (agua anual por lote, multas) | `/mi-cuenta` | Operativa |
| Comprobantes de pago: imprimir, descargar PDF y descargar respaldo bancario | `/mi-cuenta` | Operativa |
| Historial de cuentas pagadas | `/mi-cuenta` | Operativa |
| Mis lotes: mapa, superficie, referencia y turnos de cada lote | `/mi-cuenta/lotes` | Operativa |

## 4. Administración

### 4.1 Resumen general (`/admin/dashboard`)

| Funcionalidad | Estado |
|---|---|
| Indicadores del mes (recaudado, pendiente, egresos, saldo de caja) | Operativa |
| Acciones rápidas (registrar cobro, egreso, usuario, turno, asamblea, minga) | Operativa |
| Resumen operativo y próximos eventos | Operativa |

### 4.2 Gestión de Usuarios (`/admin/usuarios`)

| Funcionalidad | Pestaña | Datos y reglas | Estado |
|---|---|---|---|
| Listar y buscar usuarios (cédula o nombre), filtrar por sector y estado, paginar | Padrón | — | Operativa |
| Registrar usuario | Padrón → "Nuevo usuario" | Cédula ecuatoriana válida y única; nombres y apellidos; mayor de 18 años si se da la fecha; celular `09` + 8 dígitos; teléfono fijo de 9 dígitos; correo válido. Opcional: crear cuenta con rol | Operativa |
| Editar datos, corregir cédula, activar o inactivar | Padrón → editar | No se puede inactivar a sí mismo ni al último administrador | Operativa |
| Crear cuenta de acceso, cambiar rol o estado de cuenta | Padrón → editar | Contraseña temporal mostrada una sola vez; no puede cambiar su propia cuenta | Operativa |
| Restablecer contraseña | Padrón → editar | Nueva temporal; cierra las sesiones del usuario | Operativa |
| Ver y desbloquear cuentas bloqueadas por intentos | Padrón (aviso superior) | — | Operativa |
| Asignar o transferir terreno | Padrón → lotes del usuario → "Asignar otro terreno" | Un titular por lote; las cuotas de agua pendientes y los turnos pasan al nuevo titular | Operativa |
| Eliminar usuario sin historial | — | `DELETE /api/personas/:id` | Solo API |
| Catastro: listar, buscar, filtrar por sector | Catastro de lotes | — | Operativa |
| Registrar o editar lote | Catastro → "Nuevo lote" / editar | Sector, código `AAA-000` (con "Sugerir"), superficie en m² obligatoria, ubicación en el mapa, referencia | Operativa |
| Ver ficha del lote | Catastro → "Ver ficha" | — | Operativa |
| Sectores | — | Los sectores vienen cargados; crear o editar sectores no tiene pantalla | Solo API |

### 4.3 Convocatorias (`/admin/asistencias`)

| Funcionalidad | Estado |
|---|---|
| Crear asamblea (ordinaria o extraordinaria, título, fecha, hora, lugar, sector, orden del día, multa automática) | Operativa |
| Editar, programar, marcar convocada, cancelar | Operativa |
| Convocatoria en PDF y convocatoria por WhatsApp al grupo | Operativa (WhatsApp requiere el servicio conectado) |
| Registrar asistencia (Presente, Ausente, Justificado con archivo opcional) | Operativa |
| Acta: puntos tratados, deliberación, resoluciones; generar PDF; subir firmado | Operativa |
| Documentos firmados (convocatoria, acta, lista de asistencia) | Operativa |
| Finalizar (genera las multas por ausencia no justificada) | Operativa |
| Mingas: crear, editar, programar, convocar, asistencia, finalizar, cancelar, documentos | Operativa |
| Filtros por texto, tipo, sector y fechas | Operativa |

### 4.4 Turnos de agua (`/admin/turnos`)

| Funcionalidad | Reglas | Estado |
|---|---|---|
| Ver en tabla o calendario semanal, filtrar por sector, día y texto | — | Operativa |
| Asignar turno | Usuario con lote; día; inicio y fin; sin cruce con otro turno del mismo sector; si cruza medianoche, máximo 12 h | Operativa |
| Editar o eliminar turno | Eliminar pide confirmación | Operativa |

### 4.5 Finanzas

| Funcionalidad | Ubicación | Reglas | Estado |
|---|---|---|---|
| Cobrar en caja | Cobros y pagos → Cobrar | Agua anual y multas por separado; solo Transferencia o Depósito con número de referencia; recibo PDF | Operativa |
| Registrar egreso | Cobros y pagos → Egresos | Fecha, valor, concepto; proveedor, RUC, factura y descripción opcionales | Operativa |
| Anular egreso | — | `POST /api/financiero/egresos/:id/anular` | Solo API |
| Tarifas por concepto con vigencia | Tarifas y pago anual → Tarifas | Agua anual por hectárea, multa de asamblea, multa de minga | Operativa |
| Emitir el pago anual de agua | Tarifas y pago anual → Pago anual | Vista previa obligatoria; bloquea si hay lotes sin superficie (permite completarla ahí) y avisa de superficies provisionales | Operativa |
| Recibos: buscar, filtrar, imprimir, descargar, adjuntar comprobante bancario, anular con motivo | Historial financiero → Recibos | Comprobante: PDF, JPG o PNG hasta 10 MB; solo pagos vigentes | Operativa |
| Ingresos y egresos por año | Historial financiero → Ingresos y egresos | — | Operativa |
| Anular una obligación (exoneración) o crear una obligación manual | — | Endpoints de `obligaciones` | Solo API |

### 4.6 Gestión interna (`/admin/gestion`)

| Funcionalidad | Estado |
|---|---|
| Auditoría: filtros por fecha, acción y entidad | Operativa |
| Inventario: registrar y editar bienes | Operativa |
| Plan anual: crear plan, agregar y editar actividades con estado | Operativa |

### 4.7 Noticias (`/admin/noticias`)

| Funcionalidad | Reglas | Estado |
|---|---|---|
| Publicar, editar y eliminar noticias con imagen y etiquetas | Imagen JPG o PNG; título de longitud mínima; eliminar pide confirmación | Operativa |

### 4.8 WhatsApp Web (menú lateral)

| Funcionalidad | Estado |
|---|---|
| Conectar el teléfono de la Junta con código QR, elegir el grupo de convocatorias, desvincular | Operativa si el servicio de WhatsApp está instalado y en marcha; si no, el panel lo indica |

## Resumen

| Estado | Cantidad |
|---|---|
| Operativas | 52 |
| Parciales | 0 |
| Solo API (sin pantalla) | 5 |
| No implementadas | 0 |

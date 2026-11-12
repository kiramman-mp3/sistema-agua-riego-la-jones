# Observaciones de la documentación funcional

Inconsistencias, limitaciones y puntos no verificados encontrados al preparar la [Guía de Usuario](GUIA_DE_USUARIO.md) de la versión `v1.3.0` (2026-11-13). Complementa el [inventario funcional](INVENTARIO_FUNCIONAL.md).

## 1. Funciones que existen en el servidor pero no tienen pantalla

El plan para darles pantalla está en [`auditoria/PLAN_PANTALLAS_SOLO_API.md`](auditoria/PLAN_PANTALLAS_SOLO_API.md) (unas 19 horas).

| Función | Endpoint | Efecto para la directiva |
|---|---|---|
| Quitar la verificación en dos pasos de otra cuenta (teléfono perdido) | `POST /api/personas/:id/cuenta/totp/desactivar` | Hoy solo la puede hacer quien tenga acceso técnico; también se resuelve con `npm run db:reset-admin` en el servidor |
| Eliminar un usuario registrado por error (sin historial) | `DELETE /api/personas/:id` | En pantalla solo se puede inactivar |
| Crear y editar sectores | `/api/lotes/sectores` | Los sectores vienen cargados; uno nuevo requiere ayuda técnica |
| Anular un egreso | `POST /api/financiero/egresos/:id/anular` | Un egreso registrado por error no se puede anular desde la pantalla |
| Anular una obligación (exoneración) o crear una obligación manual | `/api/financiero/obligaciones`, `/api/financiero/agua-anual/obligaciones/:id/anular` | Las exoneraciones aprobadas en asamblea no tienen pantalla |

La guía no documenta estas funciones como disponibles.

## 2. Inconsistencias encontradas

- **Corregido (2026-11-13):** el ingreso decía "Usuario o Cédula"; ahora dice **Cédula** y solo acepta 10 dígitos (también lo valida el servidor).
- **Corregido (2026-11-13):** el horario de atención es el del pie, **sábados de 08:00 a 12:00**, también en "Mi cuenta".
- **Corregido (2026-11-13):** "Mi cuenta" ya no ofrece "Recaudación Presencial": indica que los pagos son **solo por transferencia bancaria** y dónde entregar el comprobante. La caja de la directiva sigue aceptando **Transferencia** y **Depósito** (ambos con referencia bancaria); si la Junta quiere solo transferencia también en la caja, hay que quitar "Depósito" del formulario de cobro.
- **Dato supuesto, por confirmar con la tesorería:** la cuenta bancaria que muestra "Mi cuenta" (Cuenta de Ahorros, Banco del Pichincha N° 2200112233, titular Junta de Agua La Jones, RUC 1890123456001) es de ejemplo. Está en un solo lugar, `CUENTA_BANCARIA_JUNTA` en `frontend/src/app/pages/inicio/informacion-junta.data.ts`, para cambiarla cuando se confirme.
- Las capturas `docs/assets/04-inicio-de-sesion.png` y `docs/assets/40-mi-cuenta.png` se tomaron antes de este cambio y muestran los textos anteriores.
- El encabezado del PDF del cronograma dice "JUNTA ADMINISTRADORA DE AGUA POTABLE Y RIEGO", y el resto del sistema "Junta de Agua y Riego". Conviene unificar el nombre oficial.
- La fecha de nacimiento del formulario de usuario se muestra en el formato del navegador (por ejemplo `mm/dd/yyyy` en un navegador en inglés); el sistema guarda la fecha correcta en cualquier caso.

## 3. Limitaciones conocidas

- La recuperación de contraseña es presencial: la directiva genera una contraseña temporal; no hay recuperación por correo.
- La verificación en dos pasos es opcional y solo para administradores.
- Si el servidor cambia su clave interna (`JWT_SECRET`), los administradores deben volver a activar la verificación en dos pasos.
- La convocatoria por WhatsApp necesita el servicio de WhatsApp instalado y el teléfono de la Junta vinculado; usa WhatsApp Web, que no es un servicio oficial, y el número podría ser bloqueado (ADR 0001).
- Los mapas usan los mosaicos de OpenStreetMap: necesitan conexión a internet.
- Al actualizar a `v1.3.0` cada persona debe volver a iniciar sesión una vez (la sesión pasó a una cookie segura).

## 4. Aspectos que no se pudieron verificar

- **Convocatoria por WhatsApp real:** se probó con el servicio simulado de las pruebas automáticas, no con un teléfono vinculado.
- **Impresión física** del cronograma, comprobantes y actas: se verificó la generación del PDF, no la impresora.
- **Navegadores distintos de Chrome:** la revisión se hizo en Chrome de escritorio y en vista de teléfono (390 px).
- **Datos reales:** las capturas se tomaron con la base de datos de prueba (datos ficticios); los montos y nombres no corresponden a la Junta.
- **Aplicaciones de autenticación:** el código de verificación se generó con el mismo algoritmo estándar (RFC 6238) que usan Google Authenticator y similares, no con un teléfono.

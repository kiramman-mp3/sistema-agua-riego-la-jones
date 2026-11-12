# Observaciones de la documentación funcional

Inconsistencias, limitaciones y puntos no verificados encontrados al preparar la [Guía de Usuario](GUIA_DE_USUARIO.md) de la versión `v1.3.0` (2026-11-13). Complementa el [inventario funcional](INVENTARIO_FUNCIONAL.md).

## 1. Funciones que existen en el servidor pero no tienen pantalla

| Función | Endpoint | Efecto para la directiva |
|---|---|---|
| Quitar la verificación en dos pasos de otra cuenta (teléfono perdido) | `POST /api/personas/:id/cuenta/totp/desactivar` | Hoy solo la puede hacer quien tenga acceso técnico; también se resuelve con `npm run db:reset-admin` en el servidor |
| Eliminar un usuario registrado por error (sin historial) | `DELETE /api/personas/:id` | En pantalla solo se puede inactivar |
| Crear y editar sectores | `/api/lotes/sectores` | Los sectores vienen cargados; uno nuevo requiere ayuda técnica |
| Anular un egreso | `POST /api/financiero/egresos/:id/anular` | Un egreso registrado por error no se puede anular desde la pantalla |
| Anular una obligación (exoneración) o crear una obligación manual | `/api/financiero/obligaciones`, `/api/financiero/agua-anual/obligaciones/:id/anular` | Las exoneraciones aprobadas en asamblea no tienen pantalla |

La guía no documenta estas funciones como disponibles.

## 2. Inconsistencias encontradas

- El formulario de inicio de sesión dice "Usuario o Cédula", pero el sistema solo acepta la **cédula**: no existen nombres de usuario.
- La tarjeta del pie dice "Atención: Sábados de 08:00 a 12:00", mientras que "Mi cuenta → Puntos de Pago Autorizados" dice "Lunes a Viernes de 08:00 a 16:00". Hay que confirmar el horario real con la directiva.
- "Mi cuenta" menciona "Recaudación Presencial", pero desde la regla RN-01 la caja solo registra pagos por **Transferencia** o **Depósito**; no hay cobro en efectivo.
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

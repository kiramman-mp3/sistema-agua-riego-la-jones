# ADR 0002 — Sesión en cookie HttpOnly y verificación en dos pasos opcional

- **Estado:** aceptado.
- **Fecha:** 2026-11-13.
- **Hallazgos relacionados:** AP-06 y AP-11 de [`docs/auditoria/HALLAZGOS.md`](../../auditoria/HALLAZGOS.md).

## Contexto

1. El token de sesión (JWT de 8 horas) se guardaba en `localStorage` o `sessionStorage`. Un fallo de XSS podría leerlo y usarlo desde otro equipo hasta que venciera o se cerrara la sesión.
2. Las cuentas `ADMIN` manejan cobros, anulaciones y el padrón, y solo dependían de la contraseña.

## Decisión

### Sesión en cookie HttpOnly

- Al iniciar sesión, al completar el segundo paso y al cambiar la contraseña, el servidor deja el token en la cookie `junta_sesion` con `HttpOnly`, `SameSite=Strict`, `Path=/` y `Secure` cuando la petición llega por HTTPS (detrás del proxy, con `TRUST_PROXY=1`). Con "Recordar mi sesión" la cookie dura lo que el token; sin esa opción, se borra al cerrar el navegador.
- El navegador ya no guarda el token: `localStorage`/`sessionStorage` solo guardan el usuario y la fecha de vencimiento para decidir qué pantallas mostrar.
- **CSRF:** como el navegador envía la cookie solo, cada petición que modifica datos autenticada por cookie debe llevar `X-CSRF-Token` con el valor de la cookie legible `junta_csrf` (doble envío). Otro sitio no puede leer esa cookie. Con `SameSite=Strict` es una segunda barrera.
- **Convivencia:** el servidor sigue aceptando `Authorization: Bearer` y devolviendo el token en el cuerpo, para la API, las pruebas y los clientes existentes. Esas peticiones no necesitan el token CSRF porque el navegador no añade esa cabecera por su cuenta.
- Al actualizar, las sesiones guardadas por la versión anterior se descartan y cada persona vuelve a iniciar sesión una vez.

### Verificación en dos pasos (TOTP) opcional para la directiva

- Códigos de 6 dígitos cada 30 s (RFC 6238, HMAC-SHA1), compatibles con Google Authenticator, Microsoft Authenticator, Authy y FreeOTP. Implementado con `crypto` de Node; la única dependencia nueva es `qrcode` para mostrar el código QR.
- El secreto se guarda cifrado con AES-256-GCM y una clave derivada de `JWT_SECRET` (HKDF). **Si se cambia `JWT_SECRET`, los administradores deben volver a activarla** (otro administrador puede quitarla con `POST /api/personas/:id/cuenta/totp/desactivar`, y `npm run db:reset-admin` también la quita).
- Con la verificación activa, la contraseña correcta solo entrega un token intermedio de 5 minutos que no sirve para nada más que enviar el código. Un código ya usado no se acepta de nuevo. Se entregan 8 códigos de recuperación de un solo uso, guardados como hash SHA-256.
- **Es opcional** y solo para `ADMIN`: obligarla sin aviso podría dejar fuera a la directiva. Puede volverse obligatoria más adelante.

## Consecuencias

- Un XSS ya no puede llevarse la sesión; todavía podría actuar dentro de la pestaña mientras esté abierta (la CSP `script-src 'self'` sigue siendo la defensa principal).
- En desarrollo (`ng serve` en el puerto 4200 y el backend en el 3000) el backend acepta credenciales por CORS (`credentials: true`) desde `FRONTEND_URL`.
- Un administrador que pierda el teléfono y sus códigos de recuperación necesita a otro administrador o acceso al servidor.

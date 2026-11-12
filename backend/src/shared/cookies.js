/**
 * Cookies de sesión. El navegador guarda el token en una cookie HttpOnly (`junta_sesion`) que el JavaScript de
 * la página no puede leer: un XSS no puede robar la sesión. Como el navegador envía la cookie solo, las peticiones
 * que modifican datos exigen además la cabecera X-CSRF-Token con el valor de la cookie `junta_csrf`
 * (protección CSRF por doble envío: otro sitio no puede leer esa cookie para copiarla en la cabecera).
 */
const crypto = require('crypto');

const COOKIE_SESION = 'junta_sesion';
const COOKIE_CSRF = 'junta_csrf';
const CABECERA_CSRF = 'x-csrf-token';

/** Valor de una cookie de la petición, o null. Sin dependencias: lee la cabecera Cookie. */
function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (typeof cabecera !== 'string') return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function opciones(req, { duracionMs = null, httpOnly = true } = {}) {
  return {
    httpOnly,
    // Detrás de un proxy con HTTPS (TRUST_PROXY=1) req.secure es true; en la red local sin HTTPS no se exige.
    secure: req.secure,
    sameSite: 'strict',
    path: '/',
    ...(duracionMs ? { maxAge: duracionMs } : {})
  };
}

/**
 * Deja la sesión en cookies. Con `recordar`, las cookies duran lo que el token; sin él, se borran al cerrar
 * el navegador. `expiraEn` es la fecha de vencimiento del token en ms.
 */
function guardarSesion(req, res, token, { recordar = true, expiraEn }) {
  const duracionMs = recordar ? Math.max(0, expiraEn - Date.now()) : null;
  res.cookie(COOKIE_SESION, token, opciones(req, { duracionMs }));
  res.cookie(COOKIE_CSRF, crypto.randomBytes(32).toString('base64url'), opciones(req, { duracionMs, httpOnly: false }));
}

function borrarSesion(req, res) {
  for (const [nombre, httpOnly] of [[COOKIE_SESION, true], [COOKIE_CSRF, false]]) {
    res.clearCookie(nombre, { ...opciones(req, { httpOnly }), maxAge: undefined });
  }
}

/** ¿La cabecera X-CSRF-Token coincide con la cookie junta_csrf? */
function csrfValido(req) {
  const cookie = leerCookie(req, COOKIE_CSRF);
  const cabecera = req.headers[CABECERA_CSRF];
  if (!cookie || typeof cabecera !== 'string') return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(cabecera);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { COOKIE_SESION, COOKIE_CSRF, leerCookie, guardarSesion, borrarSesion, csrfValido };

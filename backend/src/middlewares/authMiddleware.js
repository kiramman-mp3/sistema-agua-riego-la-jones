const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { COOKIE_SESION, leerCookie, csrfValido } = require('../shared/cookies');

const ALCANCE_COMPLETO = 'COMPLETO';
const ALCANCE_CAMBIO_PASSWORD = 'CAMBIO_PASSWORD';
/** Token intermedio tras una contraseña correcta cuando la cuenta tiene verificación en dos pasos. */
const ALCANCE_VERIFICAR_TOTP = 'VERIFICAR_TOTP';

function rechazar(res, status, message, codigo) {
  return res.status(status).json({ status: 'ERROR', message, ...(codigo ? { codigo } : {}) });
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Token de la petición: la cabecera Authorization (clientes de la API, pruebas) o la cookie HttpOnly de sesión
 * (el navegador). Devuelve { token, porCookie } o null.
 */
function leerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token ? { token, porCookie: false } : null;
  }
  const cookie = leerCookie(req, COOKIE_SESION);
  return cookie ? { token: cookie, porCookie: true } : null;
}

/**
 * Verifica el JWT y el estado actual de la cuenta en la base de datos:
 * - la cuenta y la persona deben seguir activas,
 * - el token debe ser posterior al último cambio de contraseña y al último cierre de sesión (revocación),
 * - el rol se toma de la base, así un cambio de rol aplica de inmediato.
 */
function crearVerificador({ permitirCambioPassword = false, soloVerificarTotp = false }) {
  return async (req, res, next) => {
    const leido = leerToken(req);
    if (!leido) return rechazar(res, 401, 'Acceso no autorizado. Inicie sesión.');
    const { token, porCookie } = leido;
    // Con la sesión en cookie, el navegador la envía solo: una petición que cambia datos debe probar que viene de
    // esta aplicación con la cabecera X-CSRF-Token.
    if (porCookie && !METODOS_SEGUROS.has(req.method) && !csrfValido(req)) {
      return rechazar(res, 403, 'La solicitud no se pudo verificar. Recargue la página e intente de nuevo.', 'CSRF');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return rechazar(res, 401, 'La sesión expiró o no es válida. Inicie sesión nuevamente.');
    }

    const [rows] = await db.query(
      `SELECT c.id, c.estado, c.password_updated_at, c.sesiones_validas_desde, c.debe_cambiar_password, p.id AS persona_id, p.estado AS persona_estado,
              p.cedula, p.nombres, p.apellidos, r.codigo AS rol
       FROM cuentas c
       JOIN personas p ON p.id = c.persona_id
       JOIN roles r ON r.id = c.rol_id
       WHERE c.id = ?`,
      [payload.cuentaId]
    );
    const cuenta = rows[0];
    if (!cuenta || cuenta.estado !== 'ACTIVA' || cuenta.persona_estado !== 'ACTIVO') {
      return rechazar(res, 401, 'La cuenta no está habilitada.');
    }

    const emitido = Number(payload.ts) || payload.iat * 1000;
    if (cuenta.password_updated_at && emitido < new Date(cuenta.password_updated_at).getTime()) {
      return rechazar(res, 401, 'La contraseña cambió. Inicie sesión nuevamente.');
    }
    if (cuenta.sesiones_validas_desde && emitido < new Date(cuenta.sesiones_validas_desde).getTime()) {
      return rechazar(res, 401, 'La sesión fue cerrada. Inicie sesión nuevamente.');
    }

    const alcance = payload.alcance || ALCANCE_COMPLETO;
    // El token intermedio de la verificación en dos pasos solo sirve para enviar el código, y solo ese token sirve ahí.
    if ((alcance === ALCANCE_VERIFICAR_TOTP) !== soloVerificarTotp) {
      return rechazar(res, 401, soloVerificarTotp ? 'Inicie sesión nuevamente.' : 'Falta el código de verificación. Inicie sesión nuevamente.');
    }
    if (alcance === ALCANCE_CAMBIO_PASSWORD && !permitirCambioPassword) {
      return rechazar(res, 403, 'Debe cambiar su contraseña temporal antes de continuar.', 'CAMBIO_PASSWORD_REQUERIDO');
    }

    req.user = {
      cuentaId: cuenta.id,
      personaId: cuenta.persona_id,
      cedula: cuenta.cedula,
      nombres: cuenta.nombres,
      apellidos: cuenta.apellidos,
      rol: cuenta.rol,
      alcance
    };
    next();
  };
}

/** Exige un token de sesión completo. */
const verificarToken = crearVerificador({ permitirCambioPassword: false });

/** Si llega un token lo valida; si no hay token deja pasar la petición sin usuario. */
function autenticacionOpcional(req, res, next) {
  if (!leerToken(req)) return next();
  return verificarToken(req, res, next);
}

/** Acepta también el token temporal emitido para cambiar la contraseña. */
const verificarTokenOCambioPassword = crearVerificador({ permitirCambioPassword: true });

/** Solo el token intermedio de la verificación en dos pasos (POST /auth/totp/verificar). */
const verificarTokenTotp = crearVerificador({ soloVerificarTotp: true });

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados.
 * @param {string[]} rolesPermitidos
 */
function verificarRol(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) return rechazar(res, 401, 'Acceso no autorizado. Inicie sesión.');
    if (!rolesPermitidos.includes(req.user.rol)) {
      return rechazar(res, 403, 'No posee permisos suficientes para esta operación.');
    }
    next();
  };
}

/** Atajo: token válido + rol. */
const requiere = (roles) => [verificarToken, verificarRol(roles)];

/** Atajo para las operaciones de la directiva (rol ADMIN). */
const soloAdmin = requiere(['ADMIN']);

const DURACION = { [ALCANCE_CAMBIO_PASSWORD]: '15m', [ALCANCE_VERIFICAR_TOTP]: '5m' };

function firmarToken(cuenta, { alcance = ALCANCE_COMPLETO } = {}) {
  return jwt.sign(
    {
      cuentaId: cuenta.cuentaId,
      personaId: cuenta.personaId,
      rol: cuenta.rol,
      alcance,
      ts: Date.now()
    },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: DURACION[alcance] ?? env.JWT_EXPIRES_IN }
  );
}

module.exports = {
  ALCANCE_COMPLETO,
  ALCANCE_CAMBIO_PASSWORD,
  ALCANCE_VERIFICAR_TOTP,
  verificarTokenTotp,
  verificarToken,
  autenticacionOpcional,
  verificarTokenOCambioPassword,
  verificarRol,
  requiere,
  soloAdmin,
  firmarToken
};

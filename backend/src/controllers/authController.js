const { z } = require('zod');
const db = require('../config/db');
const env = require('../config/env');
const { registrarAuditoria } = require('../services/auditService');
const { withTransaction } = require('../shared/transaction');
const { firmarToken, ALCANCE_CAMBIO_PASSWORD } = require('../middlewares/authMiddleware');
const { compararPassword, hashPassword, problemaConPassword, HASH_FICTICIO } = require('../shared/passwords');
const { badRequest, unauthorized, notFound } = require('../shared/errors');

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
/** Los intentos fallidos solo cuentan dentro de esta ventana desde el primero. */
const MINUTOS_VENTANA = 15;
/** Desde cuántas redes distintas con fallos en la última hora se considera un ataque distribuido a la cuenta. */
const REDES_SOSPECHOSAS = 5;
/** Retraso máximo de la respuesta a un intento fallido sobre una cuenta atacada desde muchas redes. */
const RETRASO_MAXIMO_MS = 5000;
/** Días que se conservan los intentos fallidos sin bloqueo vigente. */
const DIAS_CONSERVAR_INTENTOS = 30;
const MENSAJE_CREDENCIALES = 'Credenciales incorrectas o la cuenta no está habilitada o se encuentra bloqueada temporalmente.';

const loginSchema = z.object({
  cedula: z.string().trim().min(1, 'Ingrese su cédula.').max(20),
  password: z.string().min(1, 'Ingrese su contraseña.').max(200)
});

const cambioPasswordSchema = z.object({
  actualPassword: z.string().min(1, 'Debe proporcionar su contraseña actual.'),
  nuevaPassword: z.string()
});

function usuarioPublico(fila) {
  return {
    cuentaId: fila.cuenta_id,
    personaId: fila.persona_id,
    cedula: fila.cedula,
    nombres: fila.nombres,
    apellidos: fila.apellidos,
    email: fila.email,
    rol: fila.rol_codigo,
    rolNombre: fila.rol_nombre,
    debeCambiarPassword: Boolean(fila.debe_cambiar_password)
  };
}

/** Cuenta de la persona con esa cédula. No hay alias: cada cuenta se identifica solo por su cédula. */
async function buscarCuentaPorCedula(cedula) {
  const [rows] = await db.query(
    `SELECT c.id AS cuenta_id, c.password_hash, c.estado AS estado_cuenta, c.debe_cambiar_password,
            p.id AS persona_id, p.cedula, p.nombres, p.apellidos, p.email, p.estado AS estado_persona,
            r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM personas p
     JOIN cuentas c ON c.persona_id = p.id
     JOIN roles r ON r.id = c.rol_id
     WHERE p.cedula = ?`,
    [String(cedula || '').trim()]
  );
  return rows[0] || null;
}

/** ¿Está bloqueado el inicio de sesión de esta cuenta desde esta IP? */
async function estaBloqueada(cuentaId, ip) {
  const [[fila]] = await db.query(
    'SELECT bloqueado_hasta > UTC_TIMESTAMP() AS bloqueada FROM intentos_login WHERE cuenta_id = ? AND ip = ?',
    [cuentaId, ip]
  );
  return Boolean(fila && Number(fila.bloqueada));
}

/**
 * Suma un intento fallido de la cuenta desde esa IP y bloquea ese par al llegar al máximo dentro de la ventana.
 * Un fallo fuera de la ventana vuelve a contar desde 1. Es atómico: MySQL evalúa las asignaciones en orden y cada
 * una ve los valores ya cambiados, por eso `bloqueado_hasta` va primero (ve `intentos` y `primer_fallo_en`
 * anteriores) y `primer_fallo_en` al final (ve el `intentos` nuevo). Devuelve true si quedó bloqueado.
 */
async function registrarIntentoFallido(cuentaId, ip) {
  const enVentana = `(primer_fallo_en IS NOT NULL AND primer_fallo_en >= UTC_TIMESTAMP() - INTERVAL ${MINUTOS_VENTANA} MINUTE)`;
  await db.query(
    `INSERT INTO intentos_login (cuenta_id, ip, intentos, primer_fallo_en) VALUES (?, ?, 1, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       bloqueado_hasta = CASE WHEN ${enVentana} AND intentos + 1 >= ? THEN UTC_TIMESTAMP() + INTERVAL ? MINUTE ELSE bloqueado_hasta END,
       intentos = CASE WHEN NOT ${enVentana} THEN 1 WHEN intentos + 1 >= ? THEN 0 ELSE intentos + 1 END,
       primer_fallo_en = CASE WHEN intentos <= 1 THEN UTC_TIMESTAMP() ELSE primer_fallo_en END`,
    [cuentaId, ip, MAX_INTENTOS, MINUTOS_BLOQUEO, MAX_INTENTOS]
  );
  return estaBloqueada(cuentaId, ip);
}

/** Cantidad de redes (IP) distintas con intentos fallidos sobre la cuenta en la última hora. */
async function redesConFallos(cuentaId) {
  const [[{ redes }]] = await db.query(
    'SELECT COUNT(*) AS redes FROM intentos_login WHERE cuenta_id = ? AND updated_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR',
    [cuentaId]
  );
  return Number(redes);
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Freno a los ataques distribuidos: el bloqueo es por cuenta e IP, así que quien prueba contraseñas desde muchas
 * redes no se bloquea nunca. Desde REDES_SOSPECHOSAS redes con fallos en la última hora, cada respuesta fallida
 * se retrasa (más cuantas más redes) y se deja una alerta en la auditoría una vez por hora. No bloquea la cuenta,
 * para que un atacante no pueda dejar fuera al dueño.
 */
async function frenarAtaqueDistribuido(cuentaId, ip) {
  const redes = await redesConFallos(cuentaId);
  if (redes < REDES_SOSPECHOSAS) return;
  const [[{ alertas }]] = await db.query(
    `SELECT COUNT(*) AS alertas FROM auditoria
     WHERE accion = 'ALERTA' AND entidad = 'cuentas' AND entidad_id = ? AND fecha >= UTC_TIMESTAMP() - INTERVAL 1 HOUR`,
    [cuentaId]
  );
  if (!Number(alertas)) {
    await registrarAuditoria({
      cuentaId: null, accion: 'ALERTA', entidad: 'cuentas', entidadId: cuentaId, ip,
      detalle: { intentosDesdeVariasRedes: redes }
    });
  }
  if (!env.esTest) await esperar(Math.min(RETRASO_MAXIMO_MS, (redes - REDES_SOSPECHOSAS + 1) * 1000));
}

/** Borra los intentos fallidos viejos que ya no bloquean nada. Devuelve cuántas filas eliminó. */
async function purgarIntentosViejos(conexion = db) {
  const [r] = await conexion.query(
    `DELETE FROM intentos_login
     WHERE updated_at < UTC_TIMESTAMP() - INTERVAL ? DAY AND (bloqueado_hasta IS NULL OR bloqueado_hasta < UTC_TIMESTAMP())`,
    [DIAS_CONSERVAR_INTENTOS]
  );
  return r.affectedRows;
}

/**
 * Inicio de sesión. Responde siempre el mismo mensaje ante credenciales inválidas,
 * bloquea la cuenta desde esa IP tras varios intentos fallidos y, si la contraseña es temporal,
 * emite un token que solo sirve para cambiarla.
 */
async function login(req, res) {
  const { cedula, password } = loginSchema.parse(req.body);
  const cuenta = await buscarCuentaPorCedula(cedula);
  const ip = String(req.ip || '').slice(0, 45);

  // Igualar el tiempo de respuesta aunque la cédula no exista.
  const coincide = await compararPassword(password, cuenta ? cuenta.password_hash : HASH_FICTICIO);

  if (!cuenta || cuenta.estado_cuenta !== 'ACTIVA' || cuenta.estado_persona !== 'ACTIVO') {
    throw unauthorized(MENSAJE_CREDENCIALES);
  }

  if (await estaBloqueada(cuenta.cuenta_id, ip)) {
    throw unauthorized(MENSAJE_CREDENCIALES);
  }

  if (!coincide) {
    const bloqueada = await registrarIntentoFallido(cuenta.cuenta_id, ip);
    await frenarAtaqueDistribuido(cuenta.cuenta_id, ip);
    if (bloqueada) {
      await registrarAuditoria({
        cuentaId: cuenta.cuenta_id, accion: 'BLOQUEO', entidad: 'cuentas', entidadId: cuenta.cuenta_id, ip: req.ip,
        detalle: { minutos: MINUTOS_BLOQUEO }
      });
    }
    throw unauthorized(MENSAJE_CREDENCIALES);
  }

  await db.query('UPDATE cuentas SET ultimo_acceso = UTC_TIMESTAMP() WHERE id = ?', [cuenta.cuenta_id]);
  // Entrar bien limpia los intentos de esta IP; los bloqueos de otras IP siguen vigentes.
  await db.query('DELETE FROM intentos_login WHERE cuenta_id = ? AND ip = ?', [cuenta.cuenta_id, ip]);

  const user = usuarioPublico(cuenta);
  const token = firmarToken(user, user.debeCambiarPassword ? { alcance: ALCANCE_CAMBIO_PASSWORD } : undefined);

  await registrarAuditoria({
    cuentaId: cuenta.cuenta_id, accion: 'LOGIN', entidad: 'cuentas', entidadId: cuenta.cuenta_id, ip: req.ip,
    detalle: { rol: user.rol }
  });

  return res.json({ status: 'OK', message: 'Inicio de sesión exitoso.', token, user });
}

/**
 * Cambia la contraseña de la cuenta autenticada y devuelve un token de sesión completo.
 * Los tokens emitidos antes del cambio dejan de ser válidos.
 */
async function changePassword(req, res) {
  const { actualPassword, nuevaPassword } = cambioPasswordSchema.parse(req.body);

  const problema = problemaConPassword(nuevaPassword, { cedula: req.user.cedula });
  if (problema) throw badRequest(problema);
  if (actualPassword === nuevaPassword) throw badRequest('La nueva contraseña debe ser distinta de la actual.');

  const [rows] = await db.query('SELECT password_hash FROM cuentas WHERE id = ?', [req.user.cuentaId]);
  if (!rows.length) throw notFound('Cuenta no encontrada.');
  if (!(await compararPassword(actualPassword, rows[0].password_hash))) {
    throw badRequest('La contraseña actual ingresada es incorrecta.');
  }

  const hash = await hashPassword(nuevaPassword);
  await withTransaction(async (conexion) => {
    await conexion.query(
      `UPDATE cuentas SET password_hash = ?, debe_cambiar_password = FALSE, password_updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [hash, req.user.cuentaId]
    );
    await registrarAuditoria({
      conexion, cuentaId: req.user.cuentaId, accion: 'MODIFICAR', entidad: 'cuentas', entidadId: req.user.cuentaId, ip: req.ip,
      detalle: { cambioPassword: true }
    });
  });

  const cuenta = await buscarCuentaPorCedula(req.user.cedula);
  const user = usuarioPublico(cuenta);
  return res.json({ status: 'OK', message: 'Contraseña actualizada correctamente.', token: firmarToken(user), user });
}

/**
 * Cierra la sesión en el servidor: todos los tokens emitidos hasta ahora para esta cuenta dejan de valer
 * (también los de otros equipos donde se recordó la sesión).
 */
async function logout(req, res) {
  await db.query('UPDATE cuentas SET sesiones_validas_desde = UTC_TIMESTAMP(3) WHERE id = ?', [req.user.cuentaId]);
  await registrarAuditoria({ cuentaId: req.user.cuentaId, accion: 'LOGOUT', entidad: 'cuentas', entidadId: req.user.cuentaId, ip: req.ip });
  return res.json({ status: 'OK', message: 'Sesión cerrada.' });
}

/** Perfil de la cuenta autenticada. */
async function getMe(req, res) {
  const [rows] = await db.query(
    `SELECT c.id AS cuenta_id, c.debe_cambiar_password, c.ultimo_acceso,
            p.id AS persona_id, p.cedula, p.nombres, p.apellidos, p.email, p.telefono, p.celular, p.direccion,
            r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM cuentas c
     JOIN personas p ON p.id = c.persona_id
     JOIN roles r ON r.id = c.rol_id
     WHERE c.id = ?`,
    [req.user.cuentaId]
  );
  if (!rows.length) throw notFound('Usuario no encontrado.');
  const fila = rows[0];
  return res.json({
    status: 'OK',
    user: { ...usuarioPublico(fila), telefono: fila.telefono, celular: fila.celular, direccion: fila.direccion, ultimoAcceso: fila.ultimo_acceso }
  });
}

module.exports = { login, logout, changePassword, getMe, purgarIntentosViejos };

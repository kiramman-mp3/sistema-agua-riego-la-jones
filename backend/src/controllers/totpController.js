const { z } = require('zod');
const qrcode = require('qrcode');
const db = require('../config/db');
const totp = require('../services/totp');
const { registrarAuditoria } = require('../services/auditService');
const { withTransaction } = require('../shared/transaction');
const { firmarToken, ALCANCE_CAMBIO_PASSWORD } = require('../middlewares/authMiddleware');
const { compararPassword } = require('../shared/passwords');
const { badRequest, conflict, forbidden, notFound, unauthorized } = require('../shared/errors');
const { idParam } = require('../shared/schemas');
const { ROLES } = require('../shared/roles');

/**
 * Verificación en dos pasos (TOTP) opcional para las cuentas de la directiva. Con ella activa, el inicio de
 * sesión devuelve primero un token intermedio de 5 minutos y la sesión completa llega al enviar el código de la
 * aplicación de autenticación (o un código de recuperación de un solo uso).
 */
const codigoSchema = z.object({ codigo: z.string().trim().min(1, 'Ingrese el código.').max(20), recordar: z.boolean().default(true) });
const passwordSchema = z.object({ password: z.string().min(1, 'Ingrese su contraseña.').max(200) });

async function cuentaTotp(conexion, cuentaId, { bloquear = false } = {}) {
  const [[cuenta]] = await conexion.query(
    `SELECT c.id, c.password_hash, c.debe_cambiar_password, c.totp_secreto, c.totp_activo, c.totp_ultimo_paso, c.totp_recuperacion,
            p.id AS persona_id, p.cedula, p.nombres, p.apellidos, p.email, r.codigo AS rol_codigo, r.nombre AS rol_nombre
     FROM cuentas c JOIN personas p ON p.id = c.persona_id JOIN roles r ON r.id = c.rol_id
     WHERE c.id = ?${bloquear ? ' FOR UPDATE' : ''}`,
    [cuentaId]
  );
  if (!cuenta) throw notFound('Cuenta no encontrada.');
  return cuenta;
}

const recuperacionesDe = (cuenta) => {
  const valor = cuenta.totp_recuperacion;
  if (!valor) return [];
  return Array.isArray(valor) ? valor : JSON.parse(valor);
};

/**
 * Comprueba un código de la aplicación o de recuperación y lo consume (un código usado no vuelve a servir).
 * Debe correr dentro de una transacción con la cuenta bloqueada. Devuelve 'TOTP', 'RECUPERACION' o null.
 */
async function consumirCodigo(conexion, cuenta, codigo) {
  const paso = totp.verificarCodigo(totp.descifrar(cuenta.totp_secreto), codigo, { ultimoPaso: cuenta.totp_ultimo_paso });
  if (paso !== null) {
    await conexion.query('UPDATE cuentas SET totp_ultimo_paso = ? WHERE id = ?', [paso, cuenta.id]);
    return 'TOTP';
  }
  const hashes = recuperacionesDe(cuenta);
  const hash = totp.hashRecuperacion(codigo);
  if (/[A-Za-z]/.test(codigo) && hashes.includes(hash)) {
    await conexion.query('UPDATE cuentas SET totp_recuperacion = ? WHERE id = ?', [JSON.stringify(hashes.filter((h) => h !== hash)), cuenta.id]);
    return 'RECUPERACION';
  }
  return null;
}

/** Segundo paso del inicio de sesión: con el token intermedio y el código, entrega la sesión completa. */
async function verificar(req, res) {
  const { codigo, recordar } = codigoSchema.parse(req.body);
  const resultado = await withTransaction(async (conexion) => {
    const cuenta = await cuentaTotp(conexion, req.user.cuentaId, { bloquear: true });
    if (!cuenta.totp_activo || !cuenta.totp_secreto) throw unauthorized('Inicie sesión nuevamente.');
    const tipo = await consumirCodigo(conexion, cuenta, codigo);
    return { cuenta, tipo, quedan: tipo === 'RECUPERACION' ? recuperacionesDe(cuenta).length - 1 : null };
  });
  if (!resultado.tipo) {
    await registrarAuditoria({ cuentaId: req.user.cuentaId, accion: 'TOTP_FALLIDO', entidad: 'cuentas', entidadId: req.user.cuentaId, ip: req.ip });
    throw unauthorized('El código no es válido o ya se usó. Revise la hora del teléfono e intente con el código nuevo.');
  }

  const { cuenta } = resultado;
  const user = {
    cuentaId: cuenta.id, personaId: cuenta.persona_id, cedula: cuenta.cedula, nombres: cuenta.nombres, apellidos: cuenta.apellidos,
    email: cuenta.email, rol: cuenta.rol_codigo, rolNombre: cuenta.rol_nombre, debeCambiarPassword: Boolean(cuenta.debe_cambiar_password)
  };
  await registrarAuditoria({
    cuentaId: cuenta.id, accion: 'LOGIN', entidad: 'cuentas', entidadId: cuenta.id, ip: req.ip,
    detalle: { rol: user.rol, segundoFactor: resultado.tipo }
  });
  const token = firmarToken(user, user.debeCambiarPassword ? { alcance: ALCANCE_CAMBIO_PASSWORD } : undefined);
  require('./authController').entregarSesion(req, res, token, { recordar });
  return res.json({
    status: 'OK', message: 'Inicio de sesión exitoso.', token, user,
    ...(resultado.quedan !== null ? { codigosRecuperacionRestantes: resultado.quedan } : {})
  });
}

/** Empieza la activación: genera un secreto nuevo (aún sin activar) y devuelve el código QR para escanearlo. */
async function iniciar(req, res) {
  if (req.user.rol !== ROLES.ADMIN) throw forbidden('La verificación en dos pasos está disponible para las cuentas de la directiva.');
  const cuenta = await cuentaTotp(db, req.user.cuentaId);
  if (cuenta.totp_activo) throw conflict('La verificación en dos pasos ya está activa. Desactívela antes de configurarla de nuevo.');
  const secreto = totp.generarSecreto();
  await db.query('UPDATE cuentas SET totp_secreto = ?, totp_ultimo_paso = NULL WHERE id = ?', [totp.cifrar(secreto), cuenta.id]);
  const uri = totp.uriOtpauth(secreto, cuenta.cedula);
  return res.json({ status: 'OK', data: { secreto, uri, qr: await qrcode.toDataURL(uri, { margin: 1, width: 220 }) } });
}

/** Confirma la activación con el primer código de la aplicación y entrega los códigos de recuperación (una sola vez). */
async function activar(req, res) {
  if (req.user.rol !== ROLES.ADMIN) throw forbidden('La verificación en dos pasos está disponible para las cuentas de la directiva.');
  const { codigo } = codigoSchema.parse(req.body);
  const codigos = await withTransaction(async (conexion) => {
    const cuenta = await cuentaTotp(conexion, req.user.cuentaId, { bloquear: true });
    if (cuenta.totp_activo) throw conflict('La verificación en dos pasos ya está activa.');
    if (!cuenta.totp_secreto) throw badRequest('Primero genere el código QR.');
    const paso = totp.verificarCodigo(totp.descifrar(cuenta.totp_secreto), codigo);
    if (paso === null) throw badRequest('El código no coincide. Revise que la hora del teléfono sea la correcta e ingrese el código nuevo.');
    const { codigos: nuevos, hashes } = totp.generarCodigosRecuperacion();
    await conexion.query(
      'UPDATE cuentas SET totp_activo = TRUE, totp_ultimo_paso = ?, totp_recuperacion = ? WHERE id = ?',
      [paso, JSON.stringify(hashes), cuenta.id]
    );
    await registrarAuditoria({ conexion, cuentaId: cuenta.id, accion: 'MODIFICAR', entidad: 'cuentas', entidadId: cuenta.id, ip: req.ip, detalle: { segundoFactor: 'ACTIVADO' } });
    return nuevos;
  });
  return res.json({
    status: 'OK',
    message: 'Verificación en dos pasos activada. Guarde los códigos de recuperación en un lugar seguro: no se vuelven a mostrar.',
    codigosRecuperacion: codigos
  });
}

/** El propio administrador desactiva su verificación en dos pasos confirmando su contraseña. */
async function desactivar(req, res) {
  const { password } = passwordSchema.parse(req.body);
  await withTransaction(async (conexion) => {
    const cuenta = await cuentaTotp(conexion, req.user.cuentaId, { bloquear: true });
    if (!(await compararPassword(password, cuenta.password_hash))) throw badRequest('La contraseña ingresada es incorrecta.');
    await conexion.query(
      'UPDATE cuentas SET totp_secreto = NULL, totp_activo = FALSE, totp_ultimo_paso = NULL, totp_recuperacion = NULL WHERE id = ?',
      [cuenta.id]
    );
    await registrarAuditoria({ conexion, cuentaId: cuenta.id, accion: 'MODIFICAR', entidad: 'cuentas', entidadId: cuenta.id, ip: req.ip, detalle: { segundoFactor: 'DESACTIVADO' } });
  });
  return res.json({ status: 'OK', message: 'Verificación en dos pasos desactivada.' });
}

/** Otro administrador quita la verificación en dos pasos de una cuenta que perdió su teléfono y sus códigos. */
async function desactivarDeOtro(req, res) {
  const { id } = idParam.parse(req.params);
  if (id === req.user.personaId) throw forbidden('Para desactivar la suya use Mi cuenta.');
  await withTransaction(async (conexion) => {
    const [[cuenta]] = await conexion.query('SELECT id, totp_activo FROM cuentas WHERE persona_id = ? FOR UPDATE', [id]);
    if (!cuenta) throw notFound('El usuario no tiene cuenta de acceso.');
    await conexion.query(
      'UPDATE cuentas SET totp_secreto = NULL, totp_activo = FALSE, totp_ultimo_paso = NULL, totp_recuperacion = NULL WHERE id = ?',
      [cuenta.id]
    );
    await registrarAuditoria({ conexion, cuentaId: req.user.cuentaId, accion: 'MODIFICAR', entidad: 'cuentas', entidadId: id, ip: req.ip, detalle: { segundoFactor: 'DESACTIVADO_POR_ADMIN' } });
  });
  return res.json({ status: 'OK', message: 'Se quitó la verificación en dos pasos. El usuario entrará solo con su contraseña.' });
}

module.exports = { verificar, iniciar, activar, desactivar, desactivarDeOtro };

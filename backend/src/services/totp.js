/**
 * Verificación en dos pasos con códigos de un solo uso basados en el tiempo (TOTP, RFC 6238): los que generan
 * Google Authenticator, Microsoft Authenticator, Authy o FreeOTP. Seis dígitos, un código cada 30 segundos, HMAC-SHA1.
 *
 * El secreto se guarda cifrado (AES-256-GCM) con una clave derivada de JWT_SECRET: si se cambia JWT_SECRET,
 * los administradores deben volver a activar la verificación en dos pasos.
 */
const crypto = require('crypto');
const env = require('../config/env');

const PASO_SEGUNDOS = 30;
const DIGITOS = 6;
/** Códigos aceptados alrededor del actual, para tolerar relojes de teléfono algo desfasados. */
const VENTANA = 1;
const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const EMISOR = 'Junta La Jones';

function base32(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let texto = '';
  for (let i = 0; i < bits.length; i += 5) texto += ALFABETO_BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return texto;
}

function desdeBase32(texto) {
  let bits = '';
  for (const caracter of texto.replace(/=+$/, '').toUpperCase()) {
    const valor = ALFABETO_BASE32.indexOf(caracter);
    if (valor < 0) throw new Error('Secreto base32 inválido.');
    bits += valor.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Secreto nuevo de 160 bits en base32, como lo esperan las aplicaciones de autenticación. */
const generarSecreto = () => base32(crypto.randomBytes(20));

/** Código de 6 dígitos del paso de tiempo indicado. */
function codigoDelPaso(secreto, paso) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = crypto.createHmac('sha1', desdeBase32(secreto)).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const numero = (hmac.readUInt32BE(desplazamiento) & 0x7fffffff) % 10 ** DIGITOS;
  return String(numero).padStart(DIGITOS, '0');
}

const pasoActual = (ahora = Date.now()) => Math.floor(ahora / 1000 / PASO_SEGUNDOS);

/**
 * Devuelve el paso de tiempo del código si es válido y posterior a `ultimoPaso` (un código ya usado no vuelve a
 * servir), o null si no lo es.
 */
function verificarCodigo(secreto, codigo, { ultimoPaso = null, ahora = Date.now() } = {}) {
  const limpio = String(codigo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;
  const actual = pasoActual(ahora);
  for (let desfase = -VENTANA; desfase <= VENTANA; desfase++) {
    const paso = actual + desfase;
    if (ultimoPaso !== null && paso <= Number(ultimoPaso)) continue;
    const esperado = codigoDelPaso(secreto, paso);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(limpio))) return paso;
  }
  return null;
}

/** URI otpauth:// que las aplicaciones leen desde el código QR. */
function uriOtpauth(secreto, cuenta) {
  const etiqueta = encodeURIComponent(`${EMISOR}:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(EMISOR)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_SEGUNDOS}`;
}

const clave = () => crypto.hkdfSync('sha256', env.JWT_SECRET, 'junta-totp', 'secreto-totp', 32);

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', Buffer.from(clave()), iv);
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return ['v1', iv.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join('.');
}

function descifrar(guardado) {
  const [version, iv, etiqueta, cifrado] = String(guardado).split('.');
  if (version !== 'v1') throw new Error('Formato de secreto TOTP desconocido.');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', Buffer.from(clave()), Buffer.from(iv, 'base64url'));
  descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
  return Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8');
}

/** Códigos de recuperación de un solo uso (8 de 10 caracteres) y sus hashes para guardar. */
function generarCodigosRecuperacion(cantidad = 8) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codigos = Array.from({ length: cantidad }, () => {
    let codigo = '';
    for (let i = 0; i < 10; i++) codigo += alfabeto[crypto.randomInt(alfabeto.length)];
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  });
  return { codigos, hashes: codigos.map(hashRecuperacion) };
}

const hashRecuperacion = (codigo) =>
  crypto.createHash('sha256').update(String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

module.exports = {
  generarSecreto, codigoDelPaso, pasoActual, verificarCodigo, uriOtpauth, cifrar, descifrar,
  generarCodigosRecuperacion, hashRecuperacion, base32, desdeBase32
};

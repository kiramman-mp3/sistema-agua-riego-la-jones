const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const LARGO_MINIMO = 10;
// Contraseñas que se prueban primero en cualquier ataque, y términos del propio sistema. Se compara la parte
// de letras (sin números ni símbolos), así "Junta2026" o "password123" también se rechazan.
const COMUNES = new Set(['password', 'contrasena', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'admin', 'administrador', 'abcdefgh', 'abcdefghij', 'letmein', 'welcome', 'bienvenido', 'junta', 'juntalajones', 'lajones', 'patate', 'ecuador', 'tungurahua', 'agua', 'riego', 'iloveyou', 'monkey', 'dragon']);
// Sin caracteres ambiguos (0/O, 1/l/I) para dictarla por teléfono o anotarla a mano.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Contraseña temporal aleatoria con al menos una letra y un dígito. */
function generarPasswordTemporal(longitud = 10) {
  for (;;) {
    let clave = '';
    for (let i = 0; i < longitud; i++) clave += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (/[A-Za-z]/.test(clave) && /\d/.test(clave)) return clave;
  }
}

/** Devuelve un mensaje de error si la contraseña no cumple la política, o null si es válida. */
function problemaConPassword(clave, { cedula } = {}) {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO) return `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`;
  if (clave.length > 72) return 'La contraseña no puede superar 72 caracteres.';
  if (!/[A-Za-z]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe combinar letras y números.';
  if (cedula && clave.includes(cedula)) return 'La contraseña no puede contener su número de cédula.';
  if (COMUNES.has(clave.toLowerCase().replace(/[^a-z]/g, ''))) return 'La contraseña es demasiado común. Elija una menos predecible.';
  return null;
}

/*
 * Las contraseñas se guardan con scrypt (crypto de Node), que calcula en el pool de hilos de libuv: un inicio de
 * sesión no detiene al resto de peticiones, como sí hacía bcryptjs (JavaScript puro en el hilo principal).
 * Formato: scrypt$N$r$p$sal$hash (sal y hash en base64url). Los hashes bcrypt anteriores ($2a$, $2b$) se siguen
 * aceptando y se reemplazan por scrypt la próxima vez que la persona entra (ver necesitaRehash).
 */
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 32 };
const PREFIJO_SCRYPT = 'scrypt$';
const MEMORIA_MAXIMA = 64 * 1024 * 1024;

function derivar(clave, sal, { N, r, p, largo }) {
  return new Promise((resolver, rechazar) => {
    crypto.scrypt(clave, sal, largo, { N, r, p, maxmem: MEMORIA_MAXIMA }, (error, derivada) => (error ? rechazar(error) : resolver(derivada)));
  });
}

const formatear = (sal, derivada) =>
  ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64url'), derivada.toString('base64url')].join('$');

async function hashPassword(clave) {
  const sal = crypto.randomBytes(16);
  return formatear(sal, await derivar(clave, sal, SCRYPT));
}

async function compararPassword(clave, hash) {
  if (typeof hash !== 'string') return false;
  if (!hash.startsWith(PREFIJO_SCRYPT)) return bcrypt.compare(clave, hash);
  const [, N, r, p, sal, esperado] = hash.split('$');
  const esperadoBuf = Buffer.from(esperado, 'base64url');
  const derivada = await derivar(clave, Buffer.from(sal, 'base64url'), { N: Number(N), r: Number(r), p: Number(p), largo: esperadoBuf.length });
  return derivada.length === esperadoBuf.length && crypto.timingSafeEqual(derivada, esperadoBuf);
}

/** true si el hash es de un formato anterior (bcrypt) o con parámetros más débiles que los actuales. */
function necesitaRehash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(PREFIJO_SCRYPT)) return true;
  const [, N, r, p] = hash.split('$');
  return Number(N) < SCRYPT.N || Number(r) < SCRYPT.r || Number(p) < SCRYPT.p;
}

// Hash de referencia para igualar el tiempo de respuesta cuando la cédula no existe.
const HASH_FICTICIO = (() => {
  const sal = crypto.randomBytes(16);
  return formatear(sal, crypto.scryptSync('cuenta-inexistente', sal, SCRYPT.largo, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MEMORIA_MAXIMA }));
})();

module.exports = { generarPasswordTemporal, problemaConPassword, hashPassword, compararPassword, necesitaRehash, HASH_FICTICIO };

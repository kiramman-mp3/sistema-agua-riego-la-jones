const { test } = require('node:test');
const assert = require('node:assert/strict');

const totp = require('../../src/services/totp');

// Vectores de prueba del RFC 6238 (SHA-1, secreto "12345678901234567890"), recortados a 6 dígitos.
const SECRETO_RFC = totp.base32(Buffer.from('12345678901234567890'));

test('genera los códigos de los vectores del RFC 6238', () => {
  assert.equal(SECRETO_RFC, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totp.codigoDelPaso(SECRETO_RFC, totp.pasoActual(59 * 1000)), '287082');
  assert.equal(totp.codigoDelPaso(SECRETO_RFC, totp.pasoActual(1111111109 * 1000)), '081804');
  assert.equal(totp.codigoDelPaso(SECRETO_RFC, totp.pasoActual(2000000000 * 1000)), '279037');
});

test('acepta el código actual y el de un paso vecino, y nunca uno ya usado', () => {
  const ahora = 1_700_000_000_000;
  const paso = totp.pasoActual(ahora);
  const codigo = totp.codigoDelPaso(SECRETO_RFC, paso);
  assert.equal(totp.verificarCodigo(SECRETO_RFC, codigo, { ahora }), paso);
  assert.equal(totp.verificarCodigo(SECRETO_RFC, codigo, { ahora: ahora + 30_000 }), paso, 'tolera un paso de desfase');
  assert.equal(totp.verificarCodigo(SECRETO_RFC, codigo, { ahora: ahora + 90_000 }), null, 'no más de uno');
  assert.equal(totp.verificarCodigo(SECRETO_RFC, codigo, { ahora, ultimoPaso: paso }), null, 'un código usado no vuelve a servir');
  assert.equal(totp.verificarCodigo(SECRETO_RFC, '12345', { ahora }), null);
  assert.equal(totp.verificarCodigo(SECRETO_RFC, null, { ahora }), null);
});

test('el secreto se cifra y se descifra sin perder datos', () => {
  const secreto = totp.generarSecreto();
  assert.match(secreto, /^[A-Z2-7]{32}$/);
  const guardado = totp.cifrar(secreto);
  assert.ok(!guardado.includes(secreto));
  assert.equal(totp.descifrar(guardado), secreto);
});

test('los códigos de recuperación son únicos y se comparan sin importar guiones ni mayúsculas', () => {
  const { codigos, hashes } = totp.generarCodigosRecuperacion();
  assert.equal(new Set(codigos).size, 8);
  assert.match(codigos[0], /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal(totp.hashRecuperacion(codigos[0].toLowerCase().replace('-', '')), hashes[0]);
});

test('la URI otpauth lleva el emisor y la cuenta', () => {
  assert.match(totp.uriOtpauth('ABC', '1803456789'), /^otpauth:\/\/totp\/Junta%20La%20Jones%3A1803456789\?secret=ABC&issuer=Junta%20La%20Jones/);
});

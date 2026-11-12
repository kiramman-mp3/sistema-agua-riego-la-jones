const { test } = require('node:test');
const assert = require('node:assert/strict');
const { problemaConPassword, generarPasswordTemporal } = require('../../src/shared/passwords');

test('la contraseña exige 10 caracteres con letras y números', () => {
  assert.match(problemaConPassword('Corta1'), /al menos 10/);
  assert.match(problemaConPassword('123456789a'.slice(0, 9)), /al menos 10/);
  assert.match(problemaConPassword('soloLetrasAqui'), /letras y números/);
  assert.match(problemaConPassword('12345678901'), /letras y números/);
  assert.equal(problemaConPassword('Riego-Patate-2026'), null);
  assert.match(problemaConPassword('a'.repeat(73) + '1'), /72/);
});

test('rechaza contraseñas comunes aunque lleven números o símbolos', () => {
  for (const clave of ['password123', 'Password1234', 'Qwerty12345', 'Junta2026!!', 'LaJones-2026', 'admin12345', 'Patate2026']) {
    assert.match(problemaConPassword(clave) ?? '', /demasiado común/, clave);
  }
  assert.equal(problemaConPassword('Canal-Matriz-0417'), null);
});

test('rechaza una contraseña que contiene la cédula', () => {
  assert.match(problemaConPassword('xyz1803456789abc', { cedula: '1803456789' }), /cédula/);
});

test('las contraseñas temporales generadas cumplen la política', () => {
  for (let i = 0; i < 200; i++) assert.equal(problemaConPassword(generarPasswordTemporal()), null);
});

test('las contraseñas se guardan con scrypt y se comprueban sin bloquear el hilo principal (AP-25)', async () => {
  const { hashPassword, compararPassword, necesitaRehash } = require('../../src/shared/passwords');
  const hash = await hashPassword('Canal-Matriz-0417');
  assert.match(hash, /^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
  assert.equal(await compararPassword('Canal-Matriz-0417', hash), true);
  assert.equal(await compararPassword('Canal-Matriz-0418', hash), false);
  assert.equal(necesitaRehash(hash), false);
  assert.notEqual(await hashPassword('Canal-Matriz-0417'), hash, 'cada hash lleva su propia sal');
});

test('los hashes bcrypt anteriores se siguen aceptando y se marcan para rehacer', async () => {
  const bcrypt = require('bcryptjs');
  const { compararPassword, necesitaRehash } = require('../../src/shared/passwords');
  const anterior = bcrypt.hashSync('Canal-Matriz-0417', 4);
  assert.equal(await compararPassword('Canal-Matriz-0417', anterior), true);
  assert.equal(necesitaRehash(anterior), true);
  assert.equal(await compararPassword('x', null), false);
});

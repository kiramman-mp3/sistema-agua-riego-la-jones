const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ARGS_PREPARAR, vueltaAtras } = require('../../../scripts/actualizar');

test('al actualizar se reinstalan las dependencias: una versión nueva puede traer paquetes nuevos', () => {
  assert.deepEqual(ARGS_PREPARAR, ['run', 'prod:preparar', '--', '--instalar']);
});

test('las instrucciones de vuelta atrás también reinstalan las dependencias de la versión anterior', () => {
  const texto = vueltaAtras('v1.0.5', null);
  assert.match(texto, /git checkout v1\.0\.5/);
  assert.match(texto, /npm run prod:preparar -- --instalar/);
});

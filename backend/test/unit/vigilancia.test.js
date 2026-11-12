const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { crearContador } = require('../../src/shared/metricas');
const { comprobarDisco, evaluarRendimiento } = require('../../../scripts/vigilar');

test('el contador de errores solo cuenta respuestas 5xx de la última hora', () => {
  let ahora = 0;
  const contador = crearContador({ ahora: () => ahora, ventanaMs: 1000 });
  contador.registrar(200);
  contador.registrar(404);
  contador.registrar(500);
  contador.registrar(503);
  assert.equal(contador.total(), 2);
  ahora = 1500;
  assert.equal(contador.total(), 0, 'los errores fuera de la ventana se olvidan');
});

test('el vigilante avisa cuando queda menos espacio libre que el mínimo', () => {
  const carpetas = [os.tmpdir()];
  const gb = 1024 ** 3;
  const statfs = (libres) => () => ({ bavail: libres, bsize: gb });
  assert.match(comprobarDisco({ minimoGb: 2, carpetas, statfs: statfs(1) }), /quedan 1\.0 GB libres/);
  assert.equal(comprobarDisco({ minimoGb: 2, carpetas, statfs: statfs(5) }), null);
  assert.equal(comprobarDisco({ minimoGb: 0, carpetas, statfs: statfs(1) }), null, '0 desactiva el aviso');
});

test('el vigilante avisa de lentitud y de un pico de errores 5xx', () => {
  const limites = { lentitud: 2000, errores: 20 };
  assert.deepEqual(evaluarRendimiento({ ms: 150, errores5xx: 0 }, limites), []);
  assert.deepEqual(evaluarRendimiento({ ms: 2500, errores5xx: 25 }, limites), [
    '/api/health tardó 2500 ms (más de 2000 ms)',
    '25 errores del servidor (5xx) en la última hora'
  ]);
  assert.deepEqual(evaluarRendimiento({ ms: 100, errores5xx: null }, limites), [], 'sin el dato de errores no avisa');
});

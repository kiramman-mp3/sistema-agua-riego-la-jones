const { resetDatabase, closeDatabase } = require('../helpers/testEnv');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');

before(resetDatabase);
after(closeDatabase);

test('la comprobación de salud verifica la base y devuelve un X-Request-Id', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'OK');
  assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('el identificador que envía el proxy se conserva en la respuesta', async () => {
  const res = await request(app).get('/api/ruta-inexistente').set('X-Request-Id', 'proxy-trace-0001');
  assert.equal(res.status, 404);
  assert.equal(res.headers['x-request-id'], 'proxy-trace-0001');
});

test('si la base no responde a tiempo, la salud responde 503 TIMEOUT en lugar de quedarse esperando', async () => {
  const db = require('../../src/config/db');
  const original = db.query;
  db.query = () => new Promise(() => {});
  try {
    const inicio = Date.now();
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 503);
    assert.equal(res.body.database, 'TIMEOUT');
    assert.ok(Date.now() - inicio < 6000, 'responde poco después del límite');
  } finally {
    db.query = original;
  }
});

test('las consultas al pool tienen tiempo límite y se puede ajustar por consulta', async () => {
  const db = require('../../src/config/db');
  await assert.rejects(db.query({ sql: 'SELECT SLEEP(2)', timeout: 300 }), (error) => error.code === 'PROTOCOL_SEQUENCE_TIMEOUT');
  const [[fila]] = await db.query('SELECT 1 AS uno');
  assert.equal(fila.uno, 1, 'el pool sigue funcionando después de un tiempo agotado');
});

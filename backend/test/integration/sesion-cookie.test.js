const { resetDatabase, closeDatabase } = require('../helpers/testEnv');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { crearUsuario } = require('../helpers/fixtures');

let admin, usuario;

before(async () => {
  await resetDatabase();
  admin = await crearUsuario({ rol: 'ADMIN' });
  usuario = await crearUsuario();
});
after(closeDatabase);

/** Cookies de la respuesta como { nombre: { valor, atributos } }. */
function cookies(res) {
  const resultado = {};
  for (const linea of res.headers['set-cookie'] ?? []) {
    const [par, ...atributos] = linea.split(';').map((s) => s.trim());
    const [nombre, valor] = par.split('=');
    resultado[nombre] = { valor, atributos: atributos.map((a) => a.toLowerCase()) };
  }
  return resultado;
}

const cabeceraCookie = (c) => `junta_sesion=${c.junta_sesion.valor}; junta_csrf=${c.junta_csrf.valor}`;

test('el inicio de sesión deja la sesión en una cookie HttpOnly y SameSite=Strict, y un token CSRF legible', async () => {
  const res = await request(app).post('/api/auth/login').send({ cedula: usuario.cedula, password: usuario.password });
  assert.equal(res.status, 200);
  const c = cookies(res);
  assert.ok(c.junta_sesion.atributos.includes('httponly'));
  assert.ok(c.junta_sesion.atributos.includes('samesite=strict'));
  assert.ok(c.junta_sesion.atributos.some((a) => a.startsWith('max-age=')), 'recordada: dura lo que el token');
  assert.ok(!c.junta_csrf.atributos.includes('httponly'), 'la página debe poder leer el token CSRF');
  assert.equal(c.junta_sesion.valor, res.body.token);
});

test('sin "recordar", las cookies son de sesión del navegador', async () => {
  const res = await request(app).post('/api/auth/login').send({ cedula: usuario.cedula, password: usuario.password, recordar: false });
  assert.ok(!cookies(res).junta_sesion.atributos.some((a) => a.startsWith('max-age=') || a.startsWith('expires=')));
});

test('con la cookie se consulta sin cabecera Authorization; para modificar hace falta el token CSRF', async () => {
  const c = cookies(await request(app).post('/api/auth/login').send({ cedula: admin.cedula, password: admin.password }));
  const me = await request(app).get('/api/auth/me').set('Cookie', cabeceraCookie(c));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.cedula, admin.cedula);

  const sector = { nombre: `Sector cookie ${Date.now()}` };
  const sinCsrf = await request(app).post('/api/lotes/sectores').set('Cookie', cabeceraCookie(c)).send(sector);
  assert.equal(sinCsrf.status, 403);
  assert.equal(sinCsrf.body.codigo, 'CSRF');
  const csrfAjeno = await request(app).post('/api/lotes/sectores').set('Cookie', cabeceraCookie(c)).set('X-CSRF-Token', 'otro-valor').send(sector);
  assert.equal(csrfAjeno.status, 403);
  const conCsrf = await request(app).post('/api/lotes/sectores').set('Cookie', cabeceraCookie(c)).set('X-CSRF-Token', c.junta_csrf.valor).send(sector);
  assert.equal(conCsrf.status, 201, JSON.stringify(conCsrf.body));
});

test('los clientes con cabecera Authorization no necesitan el token CSRF', async () => {
  const res = await request(app).post('/api/auth/login').send({ cedula: admin.cedula, password: admin.password });
  const crear = await request(app).post('/api/lotes/sectores').set('Authorization', `Bearer ${res.body.token}`).send({ nombre: `Sector bearer ${Date.now()}` });
  assert.equal(crear.status, 201);
});

test('cerrar sesión borra las cookies y la cookie anterior deja de valer', async () => {
  const c = cookies(await request(app).post('/api/auth/login').send({ cedula: usuario.cedula, password: usuario.password }));
  const salir = await request(app).post('/api/auth/logout').set('Cookie', cabeceraCookie(c)).set('X-CSRF-Token', c.junta_csrf.valor);
  assert.equal(salir.status, 200);
  const borradas = cookies(salir);
  assert.equal(borradas.junta_sesion.valor, '');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', cabeceraCookie(c))).status, 401);
});

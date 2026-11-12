const { resetDatabase, closeDatabase } = require('../helpers/testEnv');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const db = require('../../src/config/db');
const totp = require('../../src/services/totp');
const { crearUsuario, auth } = require('../helpers/fixtures');

let admin, otroAdmin, usuario, secreto, codigosRecuperacion;
const conToken = (token) => ({ Authorization: `Bearer ${token}` });
const login = (u) => request(app).post('/api/auth/login').send({ cedula: u.cedula, password: u.password });
const codigoActual = (desfase = 0) => totp.codigoDelPaso(secreto, totp.pasoActual() + desfase);

before(async () => {
  await resetDatabase();
  admin = await crearUsuario({ rol: 'ADMIN' });
  otroAdmin = await crearUsuario({ rol: 'ADMIN' });
  usuario = await crearUsuario();
});
after(closeDatabase);

test('solo la directiva puede activar la verificación en dos pasos', async () => {
  assert.equal((await request(app).post('/api/auth/totp/iniciar').set(auth(usuario))).status, 403);
});

test('activar exige escanear el QR y confirmar con un código válido; entrega 8 códigos de recuperación', async () => {
  const inicio = await request(app).post('/api/auth/totp/iniciar').set(auth(admin));
  assert.equal(inicio.status, 200, JSON.stringify(inicio.body));
  secreto = inicio.body.data.secreto;
  assert.match(inicio.body.data.qr, /^data:image\/png;base64,/);
  assert.match(inicio.body.data.uri, /^otpauth:\/\/totp\//);
  const [[guardado]] = await db.query('SELECT totp_secreto, totp_activo FROM cuentas WHERE id = ?', [admin.cuentaId]);
  assert.ok(!guardado.totp_secreto.includes(secreto), 'el secreto se guarda cifrado');
  assert.equal(Number(guardado.totp_activo), 0, 'todavía no está activa');

  assert.equal((await request(app).post('/api/auth/totp/activar').set(auth(admin)).send({ codigo: '000000' })).status, 400);
  const activar = await request(app).post('/api/auth/totp/activar').set(auth(admin)).send({ codigo: codigoActual() });
  assert.equal(activar.status, 200, JSON.stringify(activar.body));
  codigosRecuperacion = activar.body.codigosRecuperacion;
  assert.equal(codigosRecuperacion.length, 8);
  assert.equal((await request(app).get('/api/auth/me').set(auth(admin))).body.user.totpActivo, true);
});

test('con la verificación activa, la contraseña solo da un token intermedio que no sirve para nada más', async () => {
  const res = await login(admin);
  assert.equal(res.status, 200);
  assert.equal(res.body.requiereTotp, true);
  assert.equal(res.body.user.cedula, undefined, 'no expone datos de la cuenta antes del segundo paso');
  const intermedio = res.body.token;
  assert.equal((await request(app).get('/api/auth/me').set(conToken(intermedio))).status, 401);
  assert.equal((await request(app).get('/api/personas').set(conToken(intermedio))).status, 401);
  // Y un token de sesión completo no sirve para el paso del código.
  assert.equal((await request(app).post('/api/auth/totp/verificar').set(auth(otroAdmin)).send({ codigo: '123456' })).status, 401);
});

test('el código correcto entrega la sesión completa y un código usado no vuelve a servir', async () => {
  const intermedio = (await login(admin)).body.token;
  const incorrecto = await request(app).post('/api/auth/totp/verificar').set(conToken(intermedio)).send({ codigo: '000000' });
  assert.equal(incorrecto.status, 401);

  const codigo = codigoActual(1);
  const correcto = await request(app).post('/api/auth/totp/verificar').set(conToken(intermedio)).send({ codigo });
  assert.equal(correcto.status, 200, JSON.stringify(correcto.body));
  assert.equal(correcto.body.user.cedula, admin.cedula);
  assert.equal((await request(app).get('/api/auth/me').set(conToken(correcto.body.token))).status, 200);

  const repetido = await request(app).post('/api/auth/totp/verificar').set(conToken((await login(admin)).body.token)).send({ codigo });
  assert.equal(repetido.status, 401, 'el mismo código no se acepta dos veces');
  const [[rastro]] = await db.query("SELECT detalle FROM auditoria WHERE accion = 'LOGIN' AND cuenta_id = ? ORDER BY id DESC LIMIT 1", [admin.cuentaId]);
  assert.equal(rastro.detalle.segundoFactor, 'TOTP');
});

test('un código de recuperación sirve una sola vez', async () => {
  const codigo = codigosRecuperacion[0];
  const primera = await request(app).post('/api/auth/totp/verificar').set(conToken((await login(admin)).body.token)).send({ codigo: codigo.toLowerCase() });
  assert.equal(primera.status, 200, JSON.stringify(primera.body));
  assert.equal(primera.body.codigosRecuperacionRestantes, 7);
  const segunda = await request(app).post('/api/auth/totp/verificar').set(conToken((await login(admin)).body.token)).send({ codigo });
  assert.equal(segunda.status, 401);
});

test('otro administrador puede quitar la verificación; el propio la desactiva con su contraseña', async () => {
  assert.equal((await request(app).post(`/api/personas/${admin.personaId}/cuenta/totp/desactivar`).set(auth(admin))).status, 403, 'la propia, no por esta vía');
  const quitar = await request(app).post(`/api/personas/${admin.personaId}/cuenta/totp/desactivar`).set(auth(otroAdmin));
  assert.equal(quitar.status, 200);
  const res = await login(admin);
  assert.equal(res.body.requiereTotp, undefined, 'vuelve a entrar solo con la contraseña');

  // Se activa de nuevo y se desactiva desde la propia cuenta.
  const inicio = await request(app).post('/api/auth/totp/iniciar').set(auth(admin));
  secreto = inicio.body.data.secreto;
  assert.equal((await request(app).post('/api/auth/totp/activar').set(auth(admin)).send({ codigo: codigoActual() })).status, 200);
  assert.equal((await request(app).post('/api/auth/totp/desactivar').set(auth(admin)).send({ password: 'incorrecta' })).status, 400);
  assert.equal((await request(app).post('/api/auth/totp/desactivar').set(auth(admin)).send({ password: admin.password })).status, 200);
  const [[cuenta]] = await db.query('SELECT totp_secreto, totp_activo FROM cuentas WHERE id = ?', [admin.cuentaId]);
  assert.deepEqual({ secreto: cuenta.totp_secreto, activo: Number(cuenta.totp_activo) }, { secreto: null, activo: 0 });
});

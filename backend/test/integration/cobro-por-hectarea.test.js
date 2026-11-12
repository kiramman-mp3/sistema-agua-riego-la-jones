const { resetDatabase, closeDatabase } = require('../helpers/testEnv');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { crearUsuario, auth, crearSector, crearLote, conceptoId } = require('../helpers/fixtures');

let admin, titular, otro, sector;
const generar = (cuerpo) => request(app).post('/api/financiero/agua-anual/obligaciones').set(auth(admin)).send(cuerpo);
const cuotaDe = async (loteId, anio) => {
  const [[fila]] = await db.query('SELECT valor_total, estado, valor_hectarea FROM obligacion_anual_agua WHERE lote_id = ? AND periodo_anio = ?', [loteId, anio]);
  return fila && { ...fila, valor_total: Number(fila.valor_total) };
};

before(async () => {
  await resetDatabase();
  admin = await crearUsuario({ rol: 'ADMIN' });
  titular = await crearUsuario();
  otro = await crearUsuario();
  sector = await crearSector('La Jones Alta');
});
after(closeDatabase);

test('la migración 033 desactiva la tarifa de agua por lote, salvo que ya haya cuotas por hectárea', async () => {
  const { helpers } = require('../../src/db/migrator');
  const migracion = require('../../database/migrations/033_cerrar_tarifa_agua_por_lote');
  const ejecutar = async () => {
    const conexion = await db.getConnection();
    try {
      await migracion.up(conexion, helpers);
    } finally {
      conexion.release();
    }
  };
  const agua = await conceptoId('AGUA_ANUAL');
  const [vieja] = await db.query("INSERT INTO tarifas (concepto_id, valor, vigencia_desde) VALUES (?, 25, '2025-01-01')", [agua]);
  await ejecutar();
  const [[cerrada]] = await db.query('SELECT activo, vigencia_hasta, observacion FROM tarifas WHERE id = ?', [vieja.insertId]);
  assert.equal(Number(cerrada.activo), 0);
  assert.ok(cerrada.vigencia_hasta, 'queda con fecha de fin');
  assert.match(cerrada.observacion, /por hectárea/);

  // Con una cuota ya emitida por hectárea, la tarifa vigente es por hectárea y no se toca.
  const [nueva] = await db.query("INSERT INTO tarifas (concepto_id, valor, vigencia_desde) VALUES (?, 40, '2019-01-01')", [agua]);
  const lote = await crearLote({ sectorId: sector, personaId: titular.personaId, codigo: 'MIG-T01', superficie: 10000 });
  await db.query(
    `INSERT INTO obligacion_anual_agua (persona_id, lote_id, periodo_anio, valor_total, valor_hectarea, superficie_m2, estado, fecha_emision, fecha_vencimiento)
     VALUES (?, ?, 2019, 40, 40, 10000, 'PENDIENTE', '2019-01-01', '2019-12-31')`,
    [titular.personaId, lote]
  );
  await ejecutar();
  const [[intacta]] = await db.query('SELECT activo, vigencia_hasta FROM tarifas WHERE id = ?', [nueva.insertId]);
  assert.deepEqual({ activo: Number(intacta.activo), vigencia_hasta: intacta.vigencia_hasta }, { activo: 1, vigencia_hasta: null });

  // Limpieza: el resto del archivo crea sus propias tarifas, lotes y cuotas.
  await db.query('DELETE FROM obligacion_anual_agua WHERE lote_id = ?', [lote]);
  await db.query('DELETE FROM lotes WHERE id = ?', [lote]);
  await db.query('DELETE FROM tarifas WHERE id IN (?)', [[vieja.insertId, nueva.insertId]]);
});

test('la cuota de cada lote es el valor por hectárea por sus hectáreas, redondeada al centavo', async () => {
  const uno = await crearLote({ sectorId: sector, personaId: titular.personaId, codigo: 'LJA-001', superficie: 15000 });
  const dos = await crearLote({ sectorId: sector, personaId: otro.personaId, codigo: 'LJA-002', superficie: 3333 });

  const simulacion = await generar({ anio: 2021, valor_hectarea: 60, simular: true });
  assert.equal(simulacion.status, 200, JSON.stringify(simulacion.body));
  assert.equal(simulacion.body.data.hectareas, 1.8333);
  assert.deepEqual(simulacion.body.data.lotes.map((l) => [l.lote_codigo, l.hectareas, l.valor]), [
    ['LJA-001', 1.5, 90],
    ['LJA-002', 0.3333, 20]
  ]);
  assert.equal(simulacion.body.data.total, 110);
  assert.equal(await cuotaDe(uno, 2021), undefined, 'simular no escribe');

  const real = await generar({ anio: 2021, valor_hectarea: 60 });
  assert.equal(real.status, 201, JSON.stringify(real.body));
  assert.deepEqual([(await cuotaDe(uno, 2021)).valor_total, (await cuotaDe(dos, 2021)).valor_total], [90, 20]);
  assert.equal(Number((await cuotaDe(uno, 2021)).valor_hectarea), 60, 'guarda el valor por hectárea con el que se calculó');
});

test('un lote sin superficie bloquea la emisión y se informa cuáles son', async () => {
  const sin = await crearLote({ sectorId: sector, personaId: titular.personaId, codigo: 'LJA-003' });
  await db.query('UPDATE lotes SET superficie_m2 = NULL WHERE id = ?', [sin]);

  for (const simular of [true, false]) {
    const res = await generar({ anio: 2022, valor_hectarea: 60, simular });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /lotes sin su superficie/);
    assert.deepEqual(res.body.lotes_sin_superficie.map((l) => l.codigo), ['LJA-003']);
  }
  assert.equal(await cuotaDe(sin, 2022), undefined, 'no se emite ninguna cuota del año');

  // Completar la superficie desbloquea la emisión.
  const corregido = await request(app).put(`/api/lotes/${sin}`).set(auth(admin)).send({ superficie_m2: 5000 });
  assert.equal(corregido.status, 200, JSON.stringify(corregido.body));
  const emision = await generar({ anio: 2022, valor_hectarea: 60 });
  assert.equal(emision.status, 201, JSON.stringify(emision.body));
  assert.equal((await cuotaDe(sin, 2022)).valor_total, 30);
});

test('al corregir la superficie de un lote se recalcula su cuota pendiente, no la pagada ni las de otro lote', async () => {
  const [[lote]] = await db.query("SELECT id FROM lotes WHERE codigo = 'LJA-001'");
  const [[lote2]] = await db.query("SELECT id FROM lotes WHERE codigo = 'LJA-002'");
  await db.query("UPDATE obligacion_anual_agua SET estado = 'PAGADA' WHERE lote_id = ? AND periodo_anio = 2021", [lote.id]);
  await generar({ anio: 2023, valor_hectarea: 40 });
  assert.equal((await cuotaDe(lote.id, 2023)).valor_total, 60);

  const res = await request(app).put(`/api/lotes/${lote.id}`).set(auth(admin)).send({ superficie_m2: 20000 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(res.body.message, /recalcularon 2 cuota/);
  assert.equal((await cuotaDe(lote.id, 2023)).valor_total, 80, 'pendiente recalculada: 2 ha × $40');
  assert.equal((await cuotaDe(lote.id, 2022)).valor_total, 120, 'cada año con su propio valor por hectárea: 2 ha × $60');
  assert.equal((await cuotaDe(lote.id, 2021)).valor_total, 90, 'la ya pagada se conserva');
  assert.equal((await cuotaDe(lote2.id, 2023)).valor_total, 13.33, 'otro lote no cambia');

  const [[auditoria]] = await db.query("SELECT detalle FROM auditoria WHERE entidad = 'lotes' AND accion = 'ACTUALIZAR' AND entidad_id = ? ORDER BY id DESC LIMIT 1", [lote.id]);
  const detalle = typeof auditoria.detalle === 'string' ? JSON.parse(auditoria.detalle) : auditoria.detalle;
  assert.equal(detalle.cuotasRecalculadas.length, 2);
  assert.equal(detalle.superficie_anterior_m2, 15000);
});

test('una cuota emitida con valor plano anterior no se recalcula', async () => {
  const [[lote]] = await db.query("SELECT id FROM lotes WHERE codigo = 'LJA-002'");
  await db.query('UPDATE obligacion_anual_agua SET valor_hectarea = NULL, superficie_m2 = NULL, valor_total = 36 WHERE lote_id = ? AND periodo_anio = 2023', [lote.id]);
  const res = await request(app).put(`/api/lotes/${lote.id}`).set(auth(admin)).send({ superficie_m2: 50000 });
  assert.equal(res.status, 200);
  assert.equal((await cuotaDe(lote.id, 2023)).valor_total, 36);
});

test('el padrón muestra las hectáreas de cada usuario y su valor anual con la tarifa por hectárea vigente', async () => {
  const sinTarifa = await request(app).get('/api/personas').set(auth(admin)).query({ limit: 50 });
  assert.equal(sinTarifa.status, 200, JSON.stringify(sinTarifa.body));
  assert.equal(sinTarifa.body.data.find((p) => p.id === titular.personaId).valor_anual_agua, null, 'sin tarifa vigente no hay valor');

  const tarifa = await request(app).post('/api/financiero/tarifas').set(auth(admin))
    .send({ concepto_id: await conceptoId('AGUA_ANUAL'), valor: 50, vigencia_desde: '2020-01-01' });
  assert.equal(tarifa.status, 201, JSON.stringify(tarifa.body));

  const res = await request(app).get('/api/personas').set(auth(admin)).query({ limit: 50 });
  const fila = (persona) => res.body.data.find((p) => p.id === persona.personaId);
  // titular: LJA-001 (20.000 m²) + LJA-003 (5.000 m²) = 2,5 ha
  assert.equal(fila(titular).hectareas_total, 2.5);
  assert.equal(fila(titular).valor_anual_agua, 125);
  assert.equal(fila(admin).hectareas_total, 0);
  assert.equal(fila(admin).valor_anual_agua, 0);
});

test('el resumen anual cuenta los lotes sin superficie y los de superficie provisional', async () => {
  const provisional = await crearLote({ sectorId: sector, personaId: otro.personaId, codigo: 'LJA-PRV', superficie: 10000 });
  await db.query("UPDATE lotes SET observacion = 'Superficie provisional de demostración: corregir.' WHERE id = ?", [provisional]);
  const sin = await crearLote({ sectorId: sector, personaId: otro.personaId, codigo: 'LJA-SIN' });
  await db.query('UPDATE lotes SET superficie_m2 = NULL WHERE id = ?', [sin]);

  const res = await request(app).get('/api/financiero/agua-anual/resumen?anio=2030').set(auth(admin));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.lotesSuperficieProvisional, 1);
  assert.equal(res.body.data.lotesSinSuperficie, 1);
});

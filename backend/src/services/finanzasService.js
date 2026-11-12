/**
 * Reglas financieras reutilizables (API y datos de prueba): pagos, anulaciones,
 * tarifas vigentes y el pago anual de agua. Reciben una conexión en transacción.
 */
const { badRequest, notFound, conflict } = require('../shared/errors');

const redondear = (n) => Math.round(Number(n) * 100) / 100;

/** Plazo para pagar una multa o un cobro manual sin fecha de vencimiento propia. */
const DIAS_PARA_VENCER = 30;

/** 'YYYY-MM-DD' más `dias` días de calendario. */
function sumarDias(fecha, dias) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
}

/** Vencimiento por defecto de una obligación emitida en `fechaEmision`. */
const vencimientoPorDefecto = (fechaEmision) => sumarDias(fechaEmision, DIAS_PARA_VENCER);

async function conceptoPorCodigo(conexion, codigo) {
  const [filas] = await conexion.query('SELECT id, codigo, nombre FROM conceptos_cobro WHERE codigo = ? AND activo = TRUE', [codigo]);
  if (!filas.length) throw conflict(`El concepto ${codigo} no está configurado o está inactivo.`);
  return filas[0];
}

/** Tarifa vigente de un concepto en una fecha (la de inicio más reciente que la cubre). */
async function tarifaVigente(conexion, conceptoId, fecha) {
  const [filas] = await conexion.query(
    `SELECT id, valor, vigencia_desde, vigencia_hasta FROM tarifas
     WHERE concepto_id = ? AND activo = TRUE AND vigencia_desde <= ? AND (vigencia_hasta IS NULL OR vigencia_hasta >= ?)
     ORDER BY vigencia_desde DESC LIMIT 1`,
    [conceptoId, fecha, fecha]
  );
  return filas[0] || null;
}

/**
 * Registra una tarifa y cierra la vigencia de la tarifa abierta anterior del mismo concepto.
 */
async function registrarTarifa(conexion, { conceptoId, valor, vigenciaDesde, vigenciaHasta = null, observacion = null }) {
  const [solapadas] = await conexion.query(
    `SELECT id FROM tarifas WHERE concepto_id = ? AND activo = TRUE AND vigencia_desde >= ? FOR UPDATE`,
    [conceptoId, vigenciaDesde]
  );
  if (solapadas.length) throw conflict('Ya existe una tarifa que inicia en esa fecha o después. Ajuste la fecha de vigencia.');

  await conexion.query(
    `UPDATE tarifas SET vigencia_hasta = DATE_SUB(?, INTERVAL 1 DAY)
     WHERE concepto_id = ? AND activo = TRUE AND (vigencia_hasta IS NULL OR vigencia_hasta >= ?)`,
    [vigenciaDesde, conceptoId, vigenciaDesde]
  );
  const [r] = await conexion.query(
    'INSERT INTO tarifas (concepto_id, valor, vigencia_desde, vigencia_hasta, observacion) VALUES (?, ?, ?, ?, ?)',
    [conceptoId, valor, vigenciaDesde, vigenciaHasta, observacion]
  );
  return r.insertId;
}

/**
 * Registra el pago completo de una o varias obligaciones pendientes del mismo usuario.
 * @returns {{ pagoId: number, valorTotal: number }}
 */
async function registrarPago(conexion, { personaId, obligacionesIds, metodo = 'TRANSFERENCIA', referencia = null, observacion = null, cuentaId, fechaPago = null }) {
  const ids = [...new Set(obligacionesIds.map(Number))];
  const [obligaciones] = await conexion.query(
    'SELECT id, persona_id, valor, estado FROM obligaciones WHERE id IN (?) FOR UPDATE',
    [ids]
  );
  if (obligaciones.length !== ids.length) throw badRequest('Una o más obligaciones seleccionadas no existen.');

  for (const ob of obligaciones) {
    if (Number(ob.persona_id) !== Number(personaId)) {
      throw badRequest(`La obligación #${ob.id} no pertenece al usuario seleccionado.`);
    }
    if (ob.estado !== 'PENDIENTE') {
      throw conflict(`La obligación #${ob.id} ya se encuentra ${ob.estado} y no se puede cobrar.`);
    }
  }

  const valorTotal = redondear(obligaciones.reduce((suma, ob) => suma + Number(ob.valor), 0));
  const [pago] = await conexion.query(
    `INSERT INTO pagos (persona_id, fecha_pago, valor_total, metodo, referencia, estado, observacion, registrado_por_cuenta_id)
     VALUES (?, ?, ?, ?, ?, 'VIGENTE', ?, ?)`,
    [personaId, fechaPago || new Date(), valorTotal, metodo, referencia, observacion, cuentaId]
  );
  await conexion.query('UPDATE obligaciones SET estado = \'PAGADA\' WHERE id IN (?)', [ids]);
  await conexion.query(
    'INSERT INTO pago_detalles (pago_id, obligacion_id, valor_pagado) VALUES ?',
    [obligaciones.map((ob) => [pago.insertId, ob.id, ob.valor])]
  );
  return { pagoId: pago.insertId, valorTotal };
}

/** Anula un pago vigente y devuelve sus obligaciones a PENDIENTE; conserva el detalle como historial. */
async function anularPago(conexion, { pagoId, motivo, cuentaId }) {
  const [pagos] = await conexion.query('SELECT * FROM pagos WHERE id = ? FOR UPDATE', [pagoId]);
  if (!pagos.length) throw notFound('Pago no encontrado.');
  if (pagos[0].estado === 'ANULADO') throw conflict('Este pago ya fue anulado.');

  const [detalles] = await conexion.query('SELECT obligacion_id FROM pago_detalles WHERE pago_id = ?', [pagoId]);
  if (detalles.length) {
    await conexion.query(
      "UPDATE obligaciones SET estado = 'PENDIENTE' WHERE id IN (?) AND estado = 'PAGADA'",
      [detalles.map((d) => d.obligacion_id)]
    );
  }
  await conexion.query(
    `UPDATE pagos SET estado = 'ANULADO', motivo_anulacion = ?, fecha_anulacion = UTC_TIMESTAMP(), anulado_por_cuenta_id = ?
     WHERE id = ?`,
    [motivo, cuentaId, pagoId]
  );
  return { pago: pagos[0], obligaciones: detalles.length };
}

/** Crea una obligación manual de un concepto de cobro vigente. */
async function crearObligacionManual(conexion, datos) {
  const [personas] = await conexion.query("SELECT id FROM personas WHERE id = ? AND estado = 'ACTIVO'", [datos.persona_id]);
  if (!personas.length) throw notFound('El usuario no existe o está inactivo.');
  const [conceptos] = await conexion.query('SELECT id, codigo FROM conceptos_cobro WHERE id = ? AND activo = TRUE', [datos.concepto_id]);
  if (!conceptos.length) throw notFound('Concepto de cobro no encontrado.');
  if (conceptos[0].codigo === 'AGUA_ANUAL') {
    throw badRequest('El pago anual de agua se emite desde Facturación anual, no como obligación manual.');
  }
  try {
    const [r] = await conexion.query(
      `INSERT INTO obligaciones (persona_id, concepto_id, periodo_anio, periodo_mes, fecha_emision, fecha_vencimiento, valor, origen, estado, observacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'PENDIENTE', ?)`,
      [datos.persona_id, datos.concepto_id, datos.periodo_anio ?? Number(datos.fecha_emision.slice(0, 4)), datos.periodo_mes ?? null,
        datos.fecha_emision, datos.fecha_vencimiento ?? vencimientoPorDefecto(datos.fecha_emision), datos.valor, datos.observacion]
    );
    return r.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw conflict('El usuario ya tiene una obligación de ese concepto para el mismo período.');
    throw error;
  }
}

/** Anula una obligación pendiente (las pagadas se revierten anulando su pago). */
async function anularObligacion(conexion, { obligacionId, motivo, cuentaId }) {
  const [filas] = await conexion.query('SELECT estado FROM obligaciones WHERE id = ? FOR UPDATE', [obligacionId]);
  if (!filas.length) throw notFound('Obligación no encontrada.');
  if (filas[0].estado !== 'PENDIENTE') {
    throw conflict(`Solo se pueden anular obligaciones pendientes; esta se encuentra ${filas[0].estado}.`);
  }
  await conexion.query(
    `UPDATE obligaciones SET estado = 'ANULADA', anulada_por_cuenta_id = ?, fecha_anulacion = UTC_TIMESTAMP(), motivo_anulacion = ?
     WHERE id = ?`,
    [cuentaId, motivo, obligacionId]
  );
}

/** Registra un egreso de caja. */
async function registrarEgreso(conexion, datos, cuentaId) {
  const [r] = await conexion.query(
    `INSERT INTO egresos (proveedor, ruc_proveedor, fecha, concepto, descripcion, numero_factura, valor, registrado_por_cuenta_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [datos.proveedor, datos.ruc_proveedor, datos.fecha, datos.concepto, datos.descripcion, datos.numero_factura, datos.valor, cuentaId]
  );
  return r.insertId;
}

/** Anula un egreso registrado por error. */
async function anularEgreso(conexion, { egresoId, motivo, cuentaId }) {
  const [filas] = await conexion.query('SELECT * FROM egresos WHERE id = ? FOR UPDATE', [egresoId]);
  if (!filas.length) throw notFound('Egreso no encontrado.');
  const egreso = filas[0];
  if (egreso.estado === 'ANULADO') throw conflict('Este egreso ya fue anulado.');

  await conexion.query(
    `UPDATE egresos
     SET estado = 'ANULADO', motivo_anulacion = ?, fecha_anulacion = CURRENT_TIMESTAMP, anulado_por_cuenta_id = ?
     WHERE id = ?`,
    [motivo, cuentaId, egresoId]
  );
  return { egreso };
}

const M2_POR_HECTAREA = 10000;
/** Nota que la migración 031 deja en los lotes a los que puso la superficie provisional de demostración. */
const NOTA_SUPERFICIE_PROVISIONAL = 'Superficie provisional de demostración: corregir.';

/** Hectáreas de un lote a partir de sus m²; null si no tiene superficie válida. */
function hectareasDeLote(superficieM2) {
  const m2 = Number(superficieM2);
  return superficieM2 != null && m2 > 0 ? m2 / M2_POR_HECTAREA : null;
}

/** Cuota anual de un lote: valor por hectárea por las hectáreas del lote, redondeada al centavo. */
function cuotaAnualDeLote(superficieM2, valorHectarea) {
  const ha = hectareasDeLote(superficieM2);
  return ha === null ? null : redondear(ha * valorHectarea);
}

/**
 * Valor por hectárea del pago anual de un año: el indicado o, si no se indica, la tarifa del concepto
 * AGUA_ANUAL vigente al 1 de enero de ese año (Ajustes → Tarifas).
 */
async function valorHectareaAgua(conexion, anio, valorHectarea) {
  if (valorHectarea != null) return redondear(valorHectarea);
  const concepto = await conceptoPorCodigo(conexion, 'AGUA_ANUAL');
  const tarifa = await tarifaVigente(conexion, concepto.id, `${anio}-01-01`);
  if (!tarifa) throw conflict(`No hay una tarifa por hectárea del pago anual de agua vigente al 1 de enero de ${anio}. Regístrela en Tarifas o indique el valor.`);
  return redondear(tarifa.valor);
}

/**
 * Pago anual de agua: genera la obligación del año por cada lote activo vinculado a un usuario activo.
 * La cuota de cada lote es el valor por hectárea por sus hectáreas (m² / 10.000), redondeada al centavo.
 * Es idempotente: las obligaciones ya emitidas de ese año y lote se respetan (clave única lote/año)
 * y conservan su valor. Con `simular` solo calcula cuántas se emitirían y su detalle por lote.
 * Si algún lote por emitir no tiene superficie, no se emite ninguna y se responde 409 con esa lista.
 * @returns {Promise<{ anio: number, valorHectarea: number, usuarios: number, generadas: number, existentes: number, hectareas: number, total: number, lotes: Array }>}
 */
async function generarObligacionesAnualesAgua(conexion, { anio, valorHectarea = null, simular = false, fechaEmision = null }) {
  const valor = await valorHectareaAgua(conexion, anio, valorHectarea);
  const [candidatos] = await conexion.query(
    `SELECT pl.persona_id, pl.lote_id, l.codigo AS lote_codigo, l.superficie_m2, s.nombre AS sector_nombre,
            CONCAT(p.nombres, ' ', p.apellidos) AS titular, (o.id IS NOT NULL) AS ya_emitida
     FROM persona_lotes pl
     JOIN personas p ON p.id = pl.persona_id
     JOIN lotes l ON l.id = pl.lote_id
     LEFT JOIN sectores s ON s.id = l.sector_id
     LEFT JOIN obligacion_anual_agua o ON o.lote_id = pl.lote_id AND o.periodo_anio = ?
     WHERE p.estado = 'ACTIVO' AND l.activo = TRUE
     ORDER BY pl.persona_id, pl.lote_id`,
    [anio]
  );
  const nuevos = candidatos.filter((c) => !Number(c.ya_emitida));
  const sinSuperficie = nuevos.filter((c) => hectareasDeLote(c.superficie_m2) === null);
  if (sinSuperficie.length) {
    throw conflict(
      'No se puede generar el cobro anual porque existen lotes sin su superficie.',
      {
        lotes_sin_superficie: sinSuperficie.map((c) => ({
          id: c.lote_id, codigo: c.lote_codigo, sector_nombre: c.sector_nombre, titular: c.titular
        }))
      }
    );
  }

  const lotes = nuevos.map((c) => ({
    persona_id: c.persona_id, lote_id: c.lote_id, lote_codigo: c.lote_codigo, sector_nombre: c.sector_nombre,
    titular: c.titular, superficie_m2: Number(c.superficie_m2),
    hectareas: hectareasDeLote(c.superficie_m2), valor: cuotaAnualDeLote(c.superficie_m2, valor)
  }));
  const resultado = {
    anio, valorHectarea: valor, usuarios: candidatos.length, generadas: nuevos.length,
    existentes: candidatos.length - nuevos.length,
    hectareas: Math.round(lotes.reduce((suma, l) => suma + l.hectareas, 0) * 10000) / 10000,
    total: redondear(lotes.reduce((suma, l) => suma + l.valor, 0)),
    lotes
  };
  if (simular || !nuevos.length) return resultado;

  const emision = fechaEmision ?? `${anio}-01-01`;
  await conexion.query(
    `INSERT INTO obligacion_anual_agua (persona_id, lote_id, periodo_anio, valor_total, valor_hectarea, superficie_m2, estado, fecha_emision, fecha_vencimiento) VALUES ?`,
    [lotes.map((l) => [l.persona_id, l.lote_id, anio, l.valor, valor, l.superficie_m2, 'PENDIENTE', emision, `${anio}-12-31`])]
  );
  return resultado;
}

/**
 * Recalcula las cuotas anuales PENDIENTES de un lote tras corregir su superficie. Solo toca las
 * emitidas por hectárea (con valor_hectarea guardado); las pagadas, anuladas y las de cuota plana anterior
 * no cambian. Debe correr dentro de la misma transacción que el cambio de superficie.
 * @returns {Promise<Array<{ id: number, anio: number, valorAnterior: number, valorNuevo: number }>>}
 */
async function recalcularCuotasPendientesDeLote(conexion, { loteId, superficieM2 }) {
  const [pendientes] = await conexion.query(
    `SELECT id, periodo_anio, valor_total, valor_hectarea FROM obligacion_anual_agua
     WHERE lote_id = ? AND estado = 'PENDIENTE' AND valor_hectarea IS NOT NULL FOR UPDATE`,
    [loteId]
  );
  const cambios = [];
  for (const o of pendientes) {
    const valorNuevo = cuotaAnualDeLote(superficieM2, Number(o.valor_hectarea));
    if (valorNuevo === null) continue;
    await conexion.query('UPDATE obligacion_anual_agua SET valor_total = ?, superficie_m2 = ? WHERE id = ?', [valorNuevo, superficieM2, o.id]);
    if (valorNuevo !== Number(o.valor_total)) {
      cambios.push({ id: o.id, anio: o.periodo_anio, valorAnterior: Number(o.valor_total), valorNuevo });
    }
  }
  return cambios;
}

/**
 * Hectáreas y valor anual del agua que le corresponde a cada usuario según sus lotes y la tarifa por
 * hectárea vigente en `fecha`. El valor es null si no hay tarifa vigente.
 * @returns {Promise<Map<number, { hectareas: number, valorAnual: number|null }>>}
 */
async function valorAnualPorPersona(conexion, personaIds, fecha) {
  const resultado = new Map();
  if (!personaIds.length) return resultado;
  const concepto = await conceptoPorCodigo(conexion, 'AGUA_ANUAL');
  const tarifa = await tarifaVigente(conexion, concepto.id, fecha);
  const [lotes] = await conexion.query(
    `SELECT pl.persona_id, l.superficie_m2 FROM persona_lotes pl JOIN lotes l ON l.id = pl.lote_id
     WHERE pl.persona_id IN (?) AND l.activo = TRUE`,
    [personaIds]
  );
  for (const id of personaIds) resultado.set(Number(id), { hectareas: 0, valorAnual: tarifa ? 0 : null });
  for (const l of lotes) {
    const ha = hectareasDeLote(l.superficie_m2);
    if (ha === null) continue;
    const fila = resultado.get(Number(l.persona_id));
    fila.hectareas = Math.round((fila.hectareas + ha) * 10000) / 10000;
    if (tarifa) fila.valorAnual = redondear(fila.valorAnual + cuotaAnualDeLote(l.superficie_m2, Number(tarifa.valor)));
  }
  return resultado;
}

/**
 * Obligaciones anuales de agua PENDIENTES de un lote, de cualquier año, con su suma. La deuda sigue al lote,
 * no a quien lo tenía: al cambiar de titular, estas pasan al nuevo.
 * @returns {Promise<{ obligaciones: Array<{ id: number, anio: number, valor: number, persona_id: number }>, total: number }>}
 */
async function deudaAnualPendienteDeLote(conexion, loteId, { bloquear = false } = {}) {
  const [filas] = await conexion.query(
    `SELECT id, periodo_anio, valor_total, persona_id FROM obligacion_anual_agua
     WHERE lote_id = ? AND estado = 'PENDIENTE' ORDER BY periodo_anio${bloquear ? ' FOR UPDATE' : ''}`,
    [loteId]
  );
  const obligaciones = filas.map((f) => ({ id: f.id, anio: f.periodo_anio, valor: Number(f.valor_total), persona_id: f.persona_id }));
  return { obligaciones, total: redondear(obligaciones.reduce((suma, o) => suma + o.valor, 0)) };
}

/**
 * Traspasa al nuevo titular las obligaciones anuales pendientes del lote. Las pagadas y anuladas quedan
 * como historial del titular que las pagó. Debe correr en la misma transacción que el cambio de titularidad.
 */
async function transferirDeudaAnualDeLote(conexion, { loteId, personaId }) {
  const deuda = await deudaAnualPendienteDeLote(conexion, loteId, { bloquear: true });
  const aMover = deuda.obligaciones.filter((o) => Number(o.persona_id) !== Number(personaId));
  if (aMover.length) {
    await conexion.query('UPDATE obligacion_anual_agua SET persona_id = ? WHERE id IN (?)', [personaId, aMover.map((o) => o.id)]);
  }
  return { obligaciones: aMover, total: redondear(aMover.reduce((suma, o) => suma + o.valor, 0)) };
}

/** Estado del pago anual de agua de un año: obligaciones emitidas, cobradas y pendientes. */
async function resumenAnualAgua(conexion, anio) {
  const [[fila]] = await conexion.query(
    `SELECT COUNT(*) AS emitidas,
            COALESCE(SUM(estado = 'PAGADA'), 0) AS pagadas,
            COALESCE(SUM(estado = 'PENDIENTE'), 0) AS pendientes,
            COALESCE(SUM(valor_total), 0) AS total,
            COALESCE(SUM(CASE WHEN estado = 'PAGADA' THEN valor_total END), 0) AS recaudado
     FROM obligacion_anual_agua WHERE periodo_anio = ? AND estado <> 'ANULADA'`,
    [anio]
  );
  // Lotes con titular que bloquean el cobro (sin superficie) o que se cobrarían sobre la superficie provisional
  // de demostración que la migración 031 pone fuera de producción.
  const [[lotes]] = await conexion.query(
    `SELECT COALESCE(SUM(l.superficie_m2 IS NULL), 0) AS sinSuperficie,
            COALESCE(SUM(l.observacion = ?), 0) AS provisionales
     FROM lotes l JOIN persona_lotes pl ON pl.lote_id = l.id
     WHERE l.activo = TRUE`,
    [NOTA_SUPERFICIE_PROVISIONAL]
  );
  return {
    anio,
    emitidas: Number(fila.emitidas),
    pagadas: Number(fila.pagadas),
    pendientes: Number(fila.pendientes),
    total: redondear(fila.total),
    recaudado: redondear(fila.recaudado),
    lotesSinSuperficie: Number(lotes.sinSuperficie),
    lotesSuperficieProvisional: Number(lotes.provisionales)
  };
}

/** Obligaciones anuales de agua sin pagar de un usuario, con desglose de lote. */
async function obligacionesAnualesPendientes(conexion, personaId) {
  const [personas] = await conexion.query('SELECT id FROM personas WHERE id = ?', [personaId]);
  if (!personas.length) throw notFound('El usuario no existe.');
  const [filas] = await conexion.query(
    `SELECT o.id, o.persona_id, o.lote_id, o.periodo_anio, o.valor_total, o.estado,
            l.codigo AS lote_codigo, s.nombre AS sector_nombre
     FROM obligacion_anual_agua o
     LEFT JOIN lotes l ON l.id = o.lote_id
     LEFT JOIN sectores s ON s.id = l.sector_id
     WHERE o.persona_id = ? AND o.estado = 'PENDIENTE'
     ORDER BY o.periodo_anio ASC, l.codigo ASC`,
    [personaId]
  );
  return filas.map((f) => ({ ...f, valor_total: Number(f.valor_total) }));
}

/**
 * Registra el pago de una o varias obligaciones anuales de agua pendientes del mismo usuario.
 * @returns {{ pagoId: number, valorTotal: number, actualizados: number }}
 */
async function registrarPagoAnualAgua(conexion, { personaId, obligacionesIds, metodo = 'TRANSFERENCIA', referencia = null, observacion = null, cuentaId, fechaPago = null }) {
  const ids = [...new Set(obligacionesIds.map(Number))];
  const [obligaciones] = await conexion.query(
    'SELECT id, persona_id, valor_total, estado FROM obligacion_anual_agua WHERE id IN (?) FOR UPDATE',
    [ids]
  );
  if (obligaciones.length !== ids.length) throw badRequest('Una o más obligaciones anuales seleccionadas no existen.');

  for (const ob of obligaciones) {
    if (Number(ob.persona_id) !== Number(personaId)) {
      throw badRequest(`La obligación anual #${ob.id} no pertenece al usuario seleccionado.`);
    }
    if (ob.estado !== 'PENDIENTE') {
      throw conflict(`La obligación anual #${ob.id} ya se encuentra ${ob.estado} y no se puede cobrar.`);
    }
  }

  const valorTotal = redondear(obligaciones.reduce((suma, ob) => suma + Number(ob.valor_total), 0));
  const [pago] = await conexion.query(
    `INSERT INTO pago_anual_agua (persona_id, valor_total, metodo, referencia, observacion, fecha_pago, registrado_por_cuenta_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [personaId, valorTotal, metodo, referencia, observacion, fechaPago || new Date(), cuentaId]
  );
  await conexion.query("UPDATE obligacion_anual_agua SET estado = 'PAGADA' WHERE id IN (?)", [ids]);
  await conexion.query(
    'INSERT INTO pago_anual_agua_detalle (pago_anual_agua_id, obligacion_anual_agua, valor_pagado) VALUES ?',
    [obligaciones.map((ob) => [pago.insertId, ob.id, ob.valor_total])]
  );
  return { pagoId: pago.insertId, valorTotal, actualizados: ids.length };
}

/** Anula un pago anual de agua vigente y devuelve sus obligaciones a PENDIENTE; conserva el detalle como historial. */
async function anularPagoAnualAgua(conexion, { pagoId, motivo, cuentaId }) {
  const [pagos] = await conexion.query('SELECT * FROM pago_anual_agua WHERE id = ? FOR UPDATE', [pagoId]);
  if (!pagos.length) throw notFound('Pago anual de agua no encontrado.');
  if (pagos[0].estado === 'ANULADO') throw conflict('Este pago ya fue anulado.');

  const [detalles] = await conexion.query('SELECT obligacion_anual_agua AS id FROM pago_anual_agua_detalle WHERE pago_anual_agua_id = ?', [pagoId]);
  if (detalles.length) {
    await conexion.query(
      "UPDATE obligacion_anual_agua SET estado = 'PENDIENTE' WHERE id IN (?) AND estado = 'PAGADA'",
      [detalles.map((d) => d.id)]
    );
  }
  await conexion.query(
    `UPDATE pago_anual_agua SET estado = 'ANULADO', motivo_anulacion = ?, fecha_anulacion = UTC_TIMESTAMP(), anulado_por_cuenta_id = ?
     WHERE id = ?`,
    [motivo, cuentaId, pagoId]
  );
  return { pago: pagos[0], obligaciones: detalles.length };
}

/** Anula una obligación anual pendiente (por ejemplo, una exoneración aprobada en asamblea). */
async function anularObligacionAnualAgua(conexion, { obligacionId, motivo, cuentaId }) {
  const [filas] = await conexion.query('SELECT estado FROM obligacion_anual_agua WHERE id = ? FOR UPDATE', [obligacionId]);
  if (!filas.length) throw notFound('Obligación anual no encontrada.');
  if (filas[0].estado !== 'PENDIENTE') {
    throw conflict(`Solo se pueden anular obligaciones pendientes; esta se encuentra ${filas[0].estado}.`);
  }
  await conexion.query(
    `UPDATE obligacion_anual_agua SET estado = 'ANULADA', anulada_por_cuenta_id = ?, fecha_anulacion = UTC_TIMESTAMP(), motivo_anulacion = ?
     WHERE id = ?`,
    [cuentaId, motivo, obligacionId]
  );
}

module.exports = {
  crearObligacionManual, anularObligacion, registrarEgreso, anularEgreso, DIAS_PARA_VENCER, vencimientoPorDefecto,
  redondear, conceptoPorCodigo, tarifaVigente, registrarTarifa, registrarPago, anularPago,
  generarObligacionesAnualesAgua, recalcularCuotasPendientesDeLote, deudaAnualPendienteDeLote, transferirDeudaAnualDeLote, valorAnualPorPersona, cuotaAnualDeLote, hectareasDeLote, resumenAnualAgua, obligacionesAnualesPendientes, registrarPagoAnualAgua,
  anularPagoAnualAgua, anularObligacionAnualAgua
};

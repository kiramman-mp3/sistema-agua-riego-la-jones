// Antes de la versión por hectárea, el valor de la tarifa AGUA_ANUAL era la cuota de cada lote. Desde 032 ese
// mismo número se multiplica por las hectáreas: una tarifa de $25 por lote pasaría a cobrar $25 por hectárea.
// Si la base nunca emitió una cuota por hectárea, sus tarifas AGUA_ANUAL activas son del modelo anterior: se
// desactivan para que la facturación pida registrar la tarifa por hectárea. Con cuotas por hectárea ya emitidas
// (bases de desarrollo sembradas o ya migradas) no se toca nada.
const NOTA = 'Tarifa por lote cerrada al pasar al cobro por hectárea: registre la tarifa por hectárea.';

module.exports.up = async (db) => {
  const [[{ porHectarea }]] = await db.query(
    'SELECT COUNT(*) AS porHectarea FROM obligacion_anual_agua WHERE valor_hectarea IS NOT NULL'
  );
  if (Number(porHectarea) > 0) return;
  await db.query(
    `UPDATE tarifas t JOIN conceptos_cobro c ON c.id = t.concepto_id
     SET t.activo = FALSE,
         t.vigencia_hasta = GREATEST(t.vigencia_desde, UTC_DATE() - INTERVAL 1 DAY),
         t.observacion = ?
     WHERE c.codigo = 'AGUA_ANUAL' AND t.activo = TRUE`,
    [NOTA]
  );
};

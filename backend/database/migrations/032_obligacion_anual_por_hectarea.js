// El pago anual de agua se cobra por hectárea. Cada obligación guarda el valor por hectárea y la
// superficie con la que se calculó, para poder recalcular su cuota si se corrige la superficie del
// lote mientras está pendiente. Las ya emitidas (cuota plana) quedan en NULL: no se recalculan.
module.exports.up = async (db, { addColumnIfMissing }) => {
  await addColumnIfMissing(db, 'obligacion_anual_agua', 'valor_hectarea', 'DECIMAL(10,2) NULL');
  await addColumnIfMissing(db, 'obligacion_anual_agua', 'superficie_m2', 'DECIMAL(12,2) NULL');
  await db.query(
    "UPDATE conceptos_cobro SET descripcion = 'Valor anual por hectárea del servicio de agua de riego' WHERE codigo = 'AGUA_ANUAL'"
  );
};

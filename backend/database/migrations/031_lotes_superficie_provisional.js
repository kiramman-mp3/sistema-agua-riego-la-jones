// La superficie del lote es obligatoria: el pago anual de agua se calcula por hectárea. Fuera de producción,
// los lotes que se registraron sin ella reciben 1 ha (10.000 m²) como valor provisional de demostración, para
// que el cobro anual de los datos de prueba no se bloquee. En producción no se inventa ninguna superficie:
// el lote queda sin ella, con una nota, y el cobro anual se bloquea (409) hasta que el administrador la registre.
const SUPERFICIE_PROVISIONAL_M2 = 10000;
const NOTA_PROVISIONAL = 'Superficie provisional de demostración: corregir.';
const NOTA_PENDIENTE = 'Falta registrar la superficie del lote.';

module.exports.up = async (db) => {
  const produccion = process.env.NODE_ENV === 'production';
  await db.query(
    "UPDATE lotes SET observacion = ? WHERE superficie_m2 IS NULL AND (observacion IS NULL OR observacion = '')",
    [produccion ? NOTA_PENDIENTE : NOTA_PROVISIONAL]
  );
  if (produccion) return;
  await db.query('UPDATE lotes SET superficie_m2 = ? WHERE superficie_m2 IS NULL', [SUPERFICIE_PROVISIONAL_M2]);
};

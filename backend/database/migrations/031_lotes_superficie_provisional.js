// La superficie del lote es obligatoria: el pago anual de agua se calcula por hectárea. Los lotes que
// se registraron sin ella reciben 1 ha (10.000 m²) como valor provisional de demostración, para que el
// cobro anual no se bloquee; el administrador debe corregirlos desde el catastro.
const SUPERFICIE_PROVISIONAL_M2 = 10000;
const NOTA = 'Superficie provisional de demostración: corregir.';

module.exports.up = async (db) => {
  await db.query(
    "UPDATE lotes SET observacion = ? WHERE superficie_m2 IS NULL AND (observacion IS NULL OR observacion = '')",
    [NOTA]
  );
  await db.query('UPDATE lotes SET superficie_m2 = ? WHERE superficie_m2 IS NULL', [SUPERFICIE_PROVISIONAL_M2]);
};

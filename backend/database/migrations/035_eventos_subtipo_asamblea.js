// El formulario de asamblea permite elegir Ordinaria o Extraordinaria, pero el dato no se guardaba: el subtipo se
// deducía del título. Ahora se guarda en `subtipo_asamblea` (NULL en las mingas). Las asambleas existentes lo
// toman de su título, igual que antes.
module.exports.up = async (db, { addColumnIfMissing }) => {
  await addColumnIfMissing(db, 'eventos', 'subtipo_asamblea', "ENUM('ORDINARIA', 'EXTRAORDINARIA') NULL AFTER tipo");
  await db.query(
    `UPDATE eventos
     SET subtipo_asamblea = CASE WHEN titulo LIKE '%extraordinaria%' THEN 'EXTRAORDINARIA' ELSE 'ORDINARIA' END
     WHERE tipo = 'ASAMBLEA' AND subtipo_asamblea IS NULL`
  );
};

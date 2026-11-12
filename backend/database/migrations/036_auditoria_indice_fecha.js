// La consulta de auditoría ordena por fecha (y filtra por fecha o acción), pero los índices eran por entidad y por
// cuenta: con la tabla grande, cada página ordenaba todas las filas. Índices por fecha y por acción y fecha.
module.exports.up = async (db, { addIndexIfMissing }) => {
  await addIndexIfMissing(db, 'auditoria', 'idx_auditoria_fecha', '(fecha, id)');
  await addIndexIfMissing(db, 'auditoria', 'idx_auditoria_accion_fecha', '(accion, fecha)');
};

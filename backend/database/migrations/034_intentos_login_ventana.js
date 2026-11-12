// Los intentos fallidos de inicio de sesión caducan: solo cuentan los de los últimos 15 minutos desde el primero.
// Antes se acumulaban sin límite de tiempo (cuatro errores de hace un mes y uno hoy bloqueaban la cuenta).
// `primer_fallo_en` marca el inicio de la ventana; el índice por fecha sirve a la purga de filas viejas.
module.exports.up = async (db, { addColumnIfMissing, addIndexIfMissing }) => {
  await addColumnIfMissing(db, 'intentos_login', 'primer_fallo_en', 'DATETIME NULL AFTER intentos');
  await addIndexIfMissing(db, 'intentos_login', 'idx_intentos_login_actualizado', '(updated_at)');
};

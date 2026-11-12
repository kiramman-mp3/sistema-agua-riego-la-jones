// Verificación en dos pasos (TOTP) opcional para las cuentas de la directiva:
// - totp_secreto: secreto cifrado (AES-256-GCM); con totp_activo = FALSE es un alta en curso, aún sin confirmar.
// - totp_activo: si es TRUE, el inicio de sesión pide además el código de la aplicación de autenticación.
// - totp_ultimo_paso: último paso de tiempo usado, para que un código no se pueda reutilizar.
// - totp_recuperacion: hashes SHA-256 de los códigos de recuperación de un solo uso que aún no se usaron.
module.exports.up = async (db, { addColumnIfMissing }) => {
  await addColumnIfMissing(db, 'cuentas', 'totp_secreto', 'VARCHAR(255) NULL');
  await addColumnIfMissing(db, 'cuentas', 'totp_activo', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await addColumnIfMissing(db, 'cuentas', 'totp_ultimo_paso', 'BIGINT NULL');
  await addColumnIfMissing(db, 'cuentas', 'totp_recuperacion', 'JSON NULL');
};

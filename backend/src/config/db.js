const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // Si la base deja de responder, las peticiones no se acumulan sin límite en memoria: al llenarse la cola fallan enseguida.
  queueLimit: 50,
  connectTimeout: 10000,
  // Las columnas DATE se devuelven como 'YYYY-MM-DD' para evitar desfases de zona horaria.
  dateStrings: ['DATE'],
  // Los DATETIME se guardan en UTC (ver SET time_zone abajo).
  timezone: 'Z',
  decimalNumbers: true
});

// Cada conexión trabaja en UTC, sin depender de la configuración del servidor MySQL, y el servidor corta
// las lecturas que superen el tiempo límite (MAX_EXECUTION_TIME solo afecta a SELECT).
pool.pool.on('connection', (conexion) => {
  conexion.query("SET time_zone = '+00:00'");
  conexion.query(`SET SESSION MAX_EXECUTION_TIME = ${Number(env.DB_QUERY_TIMEOUT_MS)}`);
});

// Las consultas directas al pool llevan además un tiempo límite del lado del cliente: si MySQL se cuelga sin
// cerrar la conexión, la petición falla en lugar de esperar para siempre.
const consultar = pool.query.bind(pool);
pool.query = (sql, valores) =>
  consultar(typeof sql === 'string' ? { sql, timeout: env.DB_QUERY_TIMEOUT_MS } : { timeout: env.DB_QUERY_TIMEOUT_MS, ...sql }, valores);

module.exports = pool;

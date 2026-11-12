#!/usr/bin/env node
/**
 * Actualiza un servidor de producción a una versión publicada (etiqueta de git), con respaldo previo:
 *
 *   npm run actualizar -- v1.1.0                 respalda, cambia a v1.1.0, compila, migra y comprueba
 *   npm run actualizar -- v1.1.0 --reiniciar     además reinicia junta-backend con systemctl (Linux)
 *
 * Pasos: árbol de trabajo limpio → respaldo (si falla, se detiene) → git fetch --tags → git checkout <etiqueta>
 * → npm run prod:preparar (dependencias, frontend, migraciones) → reinicio → espera a que /api/health responda.
 * Si algo falla después del respaldo, imprime los comandos exactos para volver a la versión anterior.
 * Ver docs/operacion.md, sección "Actualizar y volver atrás".
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const args = process.argv.slice(2);
const etiqueta = args.find((a) => !a.startsWith('--'));
const reiniciar = args.includes('--reiniciar');
const servicio = process.env.ACTUALIZAR_SERVICIO || 'junta-backend';

const fallar = (mensaje) => {
  console.error(`\n\x1b[31m[actualizar] ${mensaje}\x1b[0m`);
  process.exit(1);
};
const paso = (texto) => console.log(`\n\x1b[1m[actualizar]\x1b[0m ${texto}`);

/** Ejecuta un comando mostrando su salida; devuelve true si terminó bien. */
function ejecutar(comando, argumentos, { capturar = false } = {}) {
  const r = spawnSync(comando, argumentos, {
    cwd: raiz,
    stdio: capturar ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  return capturar ? (r.status === 0 ? r.stdout.trim() : null) : r.status === 0;
}

/** Instrucciones para volver a la versión anterior con el respaldo recién creado. */
function vueltaAtras(anterior, respaldo) {
  return [
    'Para volver a la versión anterior:',
    `  1. sudo systemctl stop ${servicio}`,
    `  2. git checkout ${anterior}`,
    `  3. npm run respaldo -- --restaurar ${respaldo ? path.relative(raiz, respaldo) : '<respaldo previo>'} --confirmar`,
    '  4. npm run prod:preparar',
    `  5. sudo systemctl start ${servicio}`
  ].join('\n');
}

async function esperarSalud(url, segundos = 60) {
  for (let i = 0; i < segundos; i += 2) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      // todavía no responde
    }
    await new Promise((resolver) => setTimeout(resolver, 2000));
  }
  return false;
}

/** El respaldo más reciente de backups/ (el que acaba de crear `npm run respaldo`). */
function ultimoRespaldo() {
  const carpeta = path.join(raiz, 'backups');
  if (!fs.existsSync(carpeta)) return null;
  const archivos = fs.readdirSync(carpeta).filter((n) => /^junta-.*\.sql\.gz$/.test(n)).sort();
  return archivos.length ? path.join(carpeta, archivos[archivos.length - 1]) : null;
}

async function main() {
  if (!etiqueta) fallar('Indique la versión: npm run actualizar -- v1.1.0 [--reiniciar]');

  paso('Comprobando el repositorio');
  const cambios = ejecutar('git', ['status', '--porcelain', '--untracked-files=no'], { capturar: true });
  if (cambios === null) fallar('No se pudo leer el estado de git.');
  if (cambios) fallar(`Hay cambios sin guardar en el servidor; no se actualiza:\n${cambios}`);
  const anterior = ejecutar('git', ['describe', '--tags', '--always'], { capturar: true });
  if (!ejecutar('git', ['fetch', '--tags', 'origin'])) fallar('No se pudieron descargar las versiones (git fetch).');
  if (!ejecutar('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${etiqueta}`], { capturar: true })) {
    fallar(`La versión ${etiqueta} no existe. Versiones disponibles: git tag --sort=-v:refname`);
  }
  console.log(`  Versión actual: ${anterior} → nueva: ${etiqueta}`);

  paso('Respaldo previo (obligatorio)');
  if (!ejecutar('npm', ['run', 'respaldo'])) fallar('El respaldo falló: no se actualiza nada.');
  const respaldo = ultimoRespaldo();
  console.log(`  Respaldo: ${respaldo ? path.relative(raiz, respaldo) : '(no encontrado)'}`);

  const abortar = (mensaje) => fallar(`${mensaje}\n\n${vueltaAtras(anterior, respaldo)}`);

  paso(`Cambiando a ${etiqueta}`);
  if (!ejecutar('git', ['checkout', '--quiet', etiqueta])) abortar(`No se pudo cambiar a ${etiqueta}.`);

  paso('Preparando dependencias, frontend y base de datos');
  if (!ejecutar('npm', ['run', 'prod:preparar'])) abortar('La preparación falló.');

  if (reiniciar) {
    paso(`Reiniciando ${servicio}`);
    if (!ejecutar('sudo', ['systemctl', 'restart', servicio])) abortar(`No se pudo reiniciar ${servicio}.`);
  } else {
    console.log(`\n  Reinicie ahora el servidor (por ejemplo: sudo systemctl restart ${servicio}). Se esperará a que responda.`);
  }

  paso('Comprobando /api/health');
  const env = require(path.join(raiz, 'backend/src/config/env.js'));
  const url = process.env.ACTUALIZAR_URL || `http://127.0.0.1:${env.PORT}/api/health`;
  if (!(await esperarSalud(url, reiniciar ? 60 : 180))) abortar(`${url} no respondió.`);

  console.log(`\n\x1b[32m[actualizar] ${etiqueta} en marcha. Guarde el respaldo previo hasta confirmar que todo funciona.\x1b[0m`);
  console.log(`\n${vueltaAtras(anterior, respaldo)}`);
}

main().catch((error) => fallar(error.message));

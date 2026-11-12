#!/usr/bin/env node
/**
 * Vigilante de disponibilidad: consulta /api/health cada minuto y avisa por webhook cuando el
 * sistema se cae y cuando se recupera. También avisa si el último respaldo es demasiado viejo, si queda poco
 * espacio en disco, si el sistema responde lento o si se disparan los errores del servidor (5xx).
 *
 *   npm run vigilar                       corre sin parar (déjelo bajo systemd, pm2 o el Programador de tareas)
 *   npm run vigilar -- --una-vez          una sola comprobación y sale con código 1 si falla (para cron)
 *
 * Variables de entorno (todas opcionales):
 *   VIGILAR_URL         URL a consultar          (por defecto http://127.0.0.1:3000/api/health)
 *   VIGILAR_INTERVALO   segundos entre consultas (60)
 *   VIGILAR_FALLOS      fallos seguidos antes de avisar, evita falsas alarmas por un reinicio (3)
 *   VIGILAR_WEBHOOK     URL que recibe un POST JSON { text, content }: sirve para Slack, Discord y Mattermost
 *   VIGILAR_RESPALDO_HORAS   horas máximas de antigüedad del último respaldo en backups/ (26); 0 desactiva
 *   VIGILAR_DISCO_MIN_GB     espacio libre mínimo, en GB, del disco del proyecto y de backups/ (2); 0 desactiva
 *   VIGILAR_LENTITUD_MS      tiempo de respuesta de /api/health a partir del cual avisa (2000)
 *   VIGILAR_ERRORES_HORA     errores 5xx en la última hora a partir de los cuales avisa (20); 0 desactiva
 *
 * Sin VIGILAR_WEBHOOK solo escribe en la consola, que systemd/pm2 guardan en su registro.
 */
const fs = require('fs');
const path = require('path');

const url = process.env.VIGILAR_URL || 'http://127.0.0.1:3000/api/health';
const intervaloMs = Number(process.env.VIGILAR_INTERVALO || 60) * 1000;
const fallosParaAvisar = Number(process.env.VIGILAR_FALLOS || 3);
const webhook = process.env.VIGILAR_WEBHOOK;
const horasRespaldo = Number(process.env.VIGILAR_RESPALDO_HORAS ?? 26);
const carpetaRespaldos = path.join(__dirname, '..', 'backups');
const unaVez = process.argv.includes('--una-vez');
const discoMinimoGb = Number(process.env.VIGILAR_DISCO_MIN_GB ?? 2);
const lentitudMs = Number(process.env.VIGILAR_LENTITUD_MS || 2000);
const erroresPorHora = Number(process.env.VIGILAR_ERRORES_HORA ?? 20);

const hora = () => new Date().toISOString();
const log = (mensaje) => console.log(`${hora()} [vigilar] ${mensaje}`);

async function avisar(mensaje) {
  log(mensaje);
  if (!webhook) return;
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: mensaje, content: mensaje }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) log(`El webhook respondió ${r.status}.`);
  } catch (error) {
    log(`No se pudo enviar el aviso: ${error.message}`);
  }
}

/**
 * Consulta /api/health. `motivo` es null si responde bien; `ms` es lo que tardó y `errores5xx` los errores del
 * servidor en la última hora (el backend solo los informa a consultas desde el mismo equipo).
 */
async function comprobarSalud() {
  const inicio = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - inicio;
    if (!r.ok) return { motivo: `respondió ${r.status}${r.status === 503 ? ' (base de datos no disponible)' : ''}`, ms };
    const cuerpo = await r.json().catch(() => ({}));
    return { motivo: null, ms, errores5xx: Number.isFinite(cuerpo.errores5xxUltimaHora) ? cuerpo.errores5xxUltimaHora : null };
  } catch (error) {
    return { motivo: `sin respuesta (${error.cause?.code ?? error.message})`, ms: Date.now() - inicio };
  }
}

/** Devuelve null si el último respaldo es reciente, o el motivo de la alerta. */
function comprobarRespaldo() {
  if (!horasRespaldo) return null;
  const archivos = fs.existsSync(carpetaRespaldos) ? fs.readdirSync(carpetaRespaldos).filter((n) => /^junta-.*\.sql\.gz$/.test(n)) : [];
  if (!archivos.length) return 'no hay ningún respaldo en backups/';
  const reciente = Math.max(...archivos.map((n) => fs.statSync(path.join(carpetaRespaldos, n)).mtimeMs));
  const horas = (Date.now() - reciente) / 3600000;
  return horas > horasRespaldo ? `el último respaldo tiene ${horas.toFixed(0)} horas` : null;
}

/** GB libres de la unidad donde está `carpeta`, o null si no se puede leer. */
function gbLibres(carpeta, statfs = fs.statfsSync) {
  try {
    const s = statfs(carpeta);
    return (s.bavail * s.bsize) / 1024 ** 3;
  } catch {
    return null;
  }
}

/** Devuelve null si hay espacio suficiente en el disco del proyecto y en el de backups/, o el motivo. */
function comprobarDisco({ minimoGb = discoMinimoGb, carpetas = [path.join(__dirname, '..'), carpetaRespaldos], statfs } = {}) {
  if (!minimoGb) return null;
  for (const carpeta of carpetas) {
    if (!fs.existsSync(carpeta)) continue;
    const libres = gbLibres(carpeta, statfs);
    if (libres !== null && libres < minimoGb) return `quedan ${libres.toFixed(1)} GB libres en el disco de ${carpeta} (mínimo ${minimoGb} GB)`;
  }
  return null;
}

/** Avisos que no son una caída: lentitud y picos de errores del servidor. */
function evaluarRendimiento({ ms, errores5xx }, { lentitud = lentitudMs, errores = erroresPorHora } = {}) {
  const avisos = [];
  if (ms > lentitud) avisos.push(`/api/health tardó ${ms} ms (más de ${lentitud} ms)`);
  if (errores && errores5xx !== null && errores5xx !== undefined && errores5xx >= errores) {
    avisos.push(`${errores5xx} errores del servidor (5xx) en la última hora`);
  }
  return avisos;
}

let fallosSeguidos = 0;
let caido = false;
// Cada aviso que no es una caída se envía una vez y se vuelve a enviar solo si desaparece y reaparece.
const alertados = new Set();

async function avisarUnaVez(clave, problema, mensaje) {
  if (problema && !alertados.has(clave)) {
    alertados.add(clave);
    await avisar(mensaje);
  } else if (!problema) {
    alertados.delete(clave);
  }
}

async function ciclo() {
  const salud = await comprobarSalud();
  if (salud.motivo) {
    fallosSeguidos += 1;
    log(`Fallo ${fallosSeguidos}/${fallosParaAvisar}: ${salud.motivo}`);
    if (!caido && fallosSeguidos >= fallosParaAvisar) {
      caido = true;
      await avisar(`🔴 Junta La Jones: el sistema no responde en ${url} — ${salud.motivo}.`);
    }
  } else {
    if (caido) await avisar(`🟢 Junta La Jones: el sistema volvió a responder en ${url}.`);
    fallosSeguidos = 0;
    caido = false;
  }

  const respaldo = comprobarRespaldo();
  await avisarUnaVez('respaldo', respaldo, `🟠 Junta La Jones: ${respaldo}. Revise la tarea programada de "npm run respaldo".`);
  const disco = comprobarDisco();
  await avisarUnaVez('disco', disco, `🟠 Junta La Jones: ${disco}. Libere espacio antes de que MySQL se detenga.`);
  const rendimiento = salud.motivo ? [] : evaluarRendimiento(salud);
  await avisarUnaVez('rendimiento', rendimiento.length ? rendimiento.join('; ') : null, `🟠 Junta La Jones: ${rendimiento.join('; ')}.`);
  return !salud.motivo && !respaldo && !disco && !rendimiento.length;
}

async function main() {
  if (unaVez) {
    // Una sola pasada: con un fallo avisa de inmediato, sin esperar varios ciclos.
    const salud = await comprobarSalud();
    const problemas = [
      salud.motivo && `el sistema no responde en ${url} — ${salud.motivo}`,
      comprobarRespaldo(),
      comprobarDisco(),
      ...(salud.motivo ? [] : evaluarRendimiento(salud))
    ].filter(Boolean);
    for (const problema of problemas) await avisar(`${problema === problemas[0] && salud.motivo ? '🔴' : '🟠'} Junta La Jones: ${problema}.`);
    if (!problemas.length) log('Todo en orden.');
    process.exit(problemas.length ? 1 : 0);
  }
  log(`Vigilando ${url} cada ${intervaloMs / 1000} s${webhook ? ' con avisos por webhook' : ' (sin webhook: solo consola)'}.`);
  for (;;) {
    await ciclo();
    await new Promise((resolver) => setTimeout(resolver, intervaloMs));
  }
}

if (require.main === module) main();

module.exports = { comprobarDisco, evaluarRendimiento, gbLibres };

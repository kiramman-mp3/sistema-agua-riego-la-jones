# Plan de corrección

Plan priorizado para los hallazgos de [`HALLAZGOS.md`](HALLAZGOS.md) (auditoría del 2026-11-12 sobre `develop` `d4a3cdc`). Cada tarea se hace en su propia rama (`fix/*`, `chore/*` o `docs/*`) desde `develop`, con commits pequeños, y no se da por cerrada sin la prueba indicada.

| Prioridad | Significado | Tareas |
|---|---|---|
| P0 | Bloquea el despliegue de esta versión | P0-1, P0-2, P0-3, P0-4 |
| P1 | Antes o inmediatamente después de salir a producción | P1-1, P1-2 |
| P2 | Corrección planificada en el siguiente sprint | P2-1, P2-2, P2-3, P2-4 |
| P3 | Mejora recomendable | P3-1 a P3-11 |

---

## P0 — Bloqueadores

### P0-1. Migración segura al cobro por hectárea (AP-01)

- **Problema:** al actualizar un servidor con `v1.0.5`, la migración `031` pone 1 ha en los lotes reales sin superficie y la tarifa `AGUA_ANUAL` vigente pasa de "por lote" a "por hectárea" sin conversión.
- **Solución propuesta:**
  1. Cambiar `031` para que no modifique `superficie_m2` cuando `NODE_ENV=production` o cuando existan obligaciones anuales emitidas (base con datos reales); en ese caso solo deja la nota. El control `lotes_sin_superficie` (409) se encarga de que el administrador complete las superficies antes de facturar.
  2. Nueva migración `033` que cierre (`vigencia_hasta`) la tarifa `AGUA_ANUAL` abierta si se creó antes de la versión por hectárea, para obligar a registrar la tarifa nueva.
  3. Aviso en el panel y en Facturación anual con el número de lotes con superficie provisional.
- **Archivos afectados:** `backend/database/migrations/031_lotes_superficie_provisional.js`, nueva `033_*.js`, `backend/src/services/finanzasService.js`, `frontend/src/app/pages/admin/components/finanzas/facturacion-anual/`, `frontend/src/app/pages/admin/dashboard/`.
- **Dependencias:** ninguna. Debe estar antes de P0-3 (publicación).
- **Criterios de aceptación:** al migrar una copia de la base de producción de `v1.0.5`, ningún lote recibe superficie inventada; la simulación del cobro anual responde 409 con la lista de lotes sin superficie, o pide registrar la tarifa por hectárea.
- **Prueba necesaria:** prueba de integración que cree una base en el estado de `v1.0.5` (lotes sin superficie, tarifa por lote, una obligación emitida), aplique las migraciones y compruebe superficies `NULL`, tarifa cerrada y 409 al simular. Ensayo manual sobre una copia restaurada del respaldo real.

### P0-2. Respaldo automático, externo, cifrado y verificado (AP-02)

- **Problema:** el respaldo, la copia externa y la prueba de restauración son pasos manuales sin verificación.
- **Solución propuesta:**
  1. `deploy/junta-respaldo.service.example` y `deploy/junta-respaldo.timer.example` (diario).
  2. En `scripts/respaldo.js`: `gzip -t` (o lectura completa con `zlib`) tras crear el archivo, checksum SHA-256 junto al respaldo y cifrado opcional con una clave pública (`age` o `gpg`) cuando se defina `RESPALDO_CLAVE_PUBLICA`.
  3. Restauración de documentos subidos dentro de `--restaurar` (opción `--con-documentos`).
  4. Copia externa: documentar y ejemplificar `rclone` con cifrado en el mismo `timer`.
  5. Prueba de restauración mensual automatizable: `npm run respaldo -- --probar <archivo>` que restaura en una base temporal, compara conteos de `personas`, `pagos` y `obligaciones` y la elimina.
- **Archivos afectados:** `scripts/respaldo.js`, `deploy/`, `docs/operacion.md`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:** en el servidor, `systemctl list-timers` muestra el respaldo; existe una copia del día fuera del servidor; `--probar` termina con conteos iguales; `vigilar.js` avisa si el respaldo supera 26 h.
- **Prueba necesaria:** ejecutar respaldo y `--probar` en una base de prueba; corromper un byte del `.gz` y comprobar que la verificación falla.

### P0-3. Procedimiento de actualización y vuelta atrás; versión publicada (AP-03)

- **Problema:** no hay forma documentada ni segura de actualizar un servidor con datos ni de volver atrás; la versión candidata no está en `main`.
- **Solución propuesta:**
  1. `GET_LOCK('junta_migraciones', 30)` / `RELEASE_LOCK` alrededor de `migrate()`.
  2. Script `npm run actualizar -- <etiqueta>`: respaldo obligatorio, `git fetch --tags`, `git checkout <etiqueta>`, `npm run prod:preparar`, reinicio del servicio, espera de `/api/health` = 200; si falla, imprime los comandos de vuelta atrás.
  3. Sección "Actualizar y volver atrás" en `docs/operacion.md`: etiqueta anterior + `npm run respaldo -- --restaurar <respaldo previo> --confirmar`.
  4. Integrar `develop` en `main` con `--no-ff` y etiquetar (`v1.1.0`) solo después de P0-1, CI verde y E2E.
- **Archivos afectados:** `backend/src/db/migrator.js`, nuevo `scripts/actualizar.js`, `package.json`, `docs/operacion.md`, `README.md`.
- **Dependencias:** P0-1, P0-2 y P0-4.
- **Criterios de aceptación:** un ensayo completo en un servidor de prueba con datos de `v1.0.5` sube a la nueva etiqueta y vuelve a `v1.0.5` con los datos del respaldo previo; dos `npm run db:migrate` simultáneos no aplican la misma migración dos veces.
- **Prueba necesaria:** prueba de integración del bloqueo del migrador (dos llamadas en paralelo); ensayo documentado de actualización y vuelta atrás.

### P0-4. E2E en verde y CI obligatoria (AP-26)

- **Problema:** la versión candidata falla 7 pruebas E2E y 20 no se ejecutan; nunca pasó por CI; `main` (`v1.0.5`) está en rojo.
- **Solución propuesta:**
  1. Depurar cada fallo con el trace de Playwright y clasificarlo: prueba desactualizada (por ejemplo `'1500 m²'` frente a `'1.500 m² (0,15 ha)'`, texto de la sede repetido) o regresión real (vista previa de Facturación anual, "Mi cuenta" al día tras el cobro, auditoría vacía, cuenta de noticias).
  2. Corregir las regresiones en ramas `fix/*` con su prueba; actualizar las pruebas desactualizadas en commits `test:` separados.
  3. Publicar `develop` y activar protección de rama en `main` y `develop` que exija los cuatro trabajos de CI en verde.
- **Archivos afectados:** `e2e/tests/01-publico.spec.js`, `03-sectores-y-lotes.spec.js`, `06-turnos.spec.js`, `09-finanzas.spec.js`, `10-mi-cuenta.spec.js`, `13-auditoria.spec.js`, `15-noticias.spec.js`, y el código que resulte de cada regresión; configuración del repositorio en GitHub.
- **Dependencias:** P0-1 (puede cambiar el comportamiento de la facturación).
- **Criterios de aceptación:** `npm run test:e2e` local y el trabajo E2E de CI terminan sin fallos ni pruebas sin ejecutar sobre el commit que se etiquete.
- **Prueba necesaria:** la propia suite E2E completa, dos ejecuciones seguidas en verde para descartar inestabilidad.

---

## P1 — Alta prioridad

### P1-1. Tiempos límite en base de datos y salud (AP-04)

- **Problema:** cola del pool infinita, consultas sin tiempo límite, `/api/health` puede colgarse.
- **Solución propuesta:** `queueLimit: 50`, `connectTimeout: 10000`, `timeout` por consulta (30 s por defecto, configurable con `DB_QUERY_TIMEOUT_MS`), y `/api/health` con `Promise.race` de 3 s que responda 503.
- **Archivos afectados:** `backend/src/config/db.js`, `backend/src/config/env.js`, `backend/src/app.js`, `backend/.env.production.example`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:** con MySQL pausado (`docker pause`), `/api/health` responde 503 en menos de 4 s y las demás peticiones fallan con 500/503 en el tiempo configurado.
- **Prueba necesaria:** prueba unitaria de `/api/health` con un pool simulado que no responde; ensayo manual con `docker pause`.

### P1-2. Observabilidad mínima de producción (AP-08)

- **Problema:** solo se detecta caída total y respaldo viejo.
- **Solución propuesta:** en `scripts/vigilar.js`, comprobación de espacio libre (`fs.statfs`) del disco de datos y de `backups/` con umbral configurable, y aviso si `/api/health` tarda más de 2 s; activar el vigilante como unidad en `deploy/`; monitor externo documentado.
- **Archivos afectados:** `scripts/vigilar.js`, `deploy/junta-vigilante.service.example`, `docs/operacion.md`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:** con el umbral de disco forzado a un valor alto, el webhook recibe el aviso.
- **Prueba necesaria:** prueba unitaria de la función de umbral; ejecución de `npm run vigilar -- --una-vez` con umbral forzado.

---

## P2 — Prioridad media

### P2-1. Auditoría dentro de la transacción en operaciones con dinero (AP-05)

- **Solución propuesta:** usar `conAuditoria` (o pasar `conexion`) en finalizar evento/minga, registrar asistencias, transferir lote, corregir superficie y crear/actualizar lote. El resto puede quedar como está.
- **Archivos afectados:** `eventoController.js`, `mingaController.js`, `loteController.js`.
- **Criterios de aceptación:** si el `INSERT` en `auditoria` falla, la operación se revierte.
- **Prueba necesaria:** prueba de integración que renombre temporalmente la tabla `auditoria` (o simule el fallo) y compruebe que finalizar un evento no genera multas.

### P2-2. Endurecer el acceso de administración (AP-06, AP-12)

- **Solución propuesta:** contador por cuenta en todas las IP con retraso progresivo y aviso en el panel; caducidad de `intentos` (reinicio si `updated_at` es anterior a 15 min); purga de filas viejas al iniciar sesión o con el vigilante; TOTP opcional para ADMIN (fase posterior, con su propia ADR).
- **Archivos afectados:** `authController.js`, nueva migración, `personaController.js` (desbloqueo), frontend de login y Mi cuenta.
- **Criterios de aceptación:** 20 intentos fallidos desde 20 IP distintas contra una cuenta producen retraso y aviso; un fallo de hace más de 15 min no cuenta.
- **Prueba necesaria:** pruebas de integración con `X-Forwarded-For` variable y `TRUST_PROXY=1`.

### P2-3. Riesgo aceptado del servicio de WhatsApp (AP-07, AP-19)

- **Solución propuesta:** `deploy/junta-whatsapp.service.example` con `Restart=always`; registrar la aceptación del riesgo como ADR con fecha de revisión; instalar con `PUPPETEER_SKIP_DOWNLOAD=true` y `CHROME_BIN` del sistema.
- **Archivos afectados:** `deploy/`, `docs/operacion.md`, `docs/architecture/adr/` (nuevo).
- **Criterios de aceptación:** el servicio se reinicia solo tras `kill -9`.
- **Prueba necesaria:** ensayo manual en el servidor.

### P2-4. Guardar el subtipo de asamblea (AP-27)

- **Solución propuesta:** migración con columna `subtipo ENUM('ORDINARIA','EXTRAORDINARIA') NULL` que la rellene a partir del título en los datos existentes; guardarla al crear y editar; filtrar por la columna en `listarEventosPasados`.
- **Archivos afectados:** nueva migración, `backend/src/schemas/eventos.js`, `backend/src/services/eventosService.js`, formulario de asamblea.
- **Criterios de aceptación:** una asamblea "Extraordinaria" sin la palabra en el título se muestra y filtra como extraordinaria.
- **Prueba necesaria:** quitar `test.fail` de `e2e/tests/04-asambleas.spec.js:222` y que pase; prueba de integración del filtro.

---

## P3 — Mejoras

| Tarea | Hallazgo | Solución | Archivos | Prueba |
|---|---|---|---|---|
| P3-1 | AP-09 | Leer el lote con `FOR UPDATE` dentro de la transacción | `loteController.js` | Integración: dos `PUT` concurrentes conservan ambos cambios o uno falla limpio |
| P3-2 | AP-10 | Al anular un pago anual, reasignar la cuota al titular actual del lote | `finanzasService.js` | Integración: transferir lote, anular pago anterior, comprobar titular |
| P3-3 | AP-11 | Evaluar cookie `HttpOnly` + CSRF (ADR) | `authController.js`, `auth.interceptor.ts` | E2E de sesión |
| P3-4 | AP-13 | Usuario MySQL de ejecución sin DDL | `docs/operacion.md`, `scripts/prod.js` | Ensayo en servidor |
| P3-5 | AP-14 | Integrar PRs de Dependabot pendientes (Angular 22.2.6, etc.) | `package.json` de cada paquete | CI verde, `npm audit` sin altos |
| P3-6 | AP-15 | `@vitest/coverage-v8`, cobertura en CI, pruebas de `deletePersona` | `frontend/package.json`, `.github/workflows/ci.yml`, `backend/test/` | CI publica cobertura |
| P3-7 | AP-16 | Comprobar que producción no tiene la cédula de ejemplo `1800000001` | — | Consulta en producción |
| P3-8 | AP-17 | Índice `(fecha, id)` en `auditoria` | Nueva migración | `EXPLAIN` sin `filesort` |
| P3-9 | AP-18 | Marcas de revocación con la hora de Node o tolerancia de reloj | `authController.js`, `personaController.js` | Unitaria con reloj desfasado |
| P3-10 | AP-24 | Revisar si `jspdf`/`leaflet` tienen variantes ESM | `angular.json` | Build sin avisos |
| P3-11 | AP-25 | `bcrypt` nativo o `crypto.scrypt`, rehash al iniciar sesión | `shared/passwords.js`, `authController.js` | Unitaria de compatibilidad de hashes; medida de latencia con 50 ingresos en paralelo |

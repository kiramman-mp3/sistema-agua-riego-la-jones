# Hallazgos de la auditoría de preparación para producción

- **Fecha:** 2026-11-12
- **Versión auditada:** rama `develop`, commit `d4a3cdc` (33 commits por delante de `main` / `v1.0.5`, `45fc1eb`).
- **Identificadores:** `AP-xx` (auditoría de producción). No se reutilizan los `H-01`…`H-36` de la auditoría anterior, ya corregidos.
- **Severidad:** CRÍTICO impide desplegar; ALTO debe resolverse antes de producción; MEDIO requiere corrección planificada; BAJO mejora recomendable; INFORMATIVO sin riesgo directo.
- **Impacto y probabilidad:** escala Alta / Media / Baja. La probabilidad considera el contexto real: una junta de riego con decenas o pocos cientos de usuarios, uno a tres administradores y un único servidor.

No se encontraron hallazgos CRÍTICOS. La siguiente tabla resume el resto; el detalle de cada uno va después.

| ID | Severidad | Categoría | Título |
|---|---|---|---|
| AP-01 | ALTO | Base de datos / Reglas de negocio | Actualizar desde `v1.0.5` altera los datos de cobro: superficie inventada y tarifa reinterpretada |
| AP-02 | ALTO | Continuidad / Respaldos | La protección ante pérdida de datos depende de pasos manuales sin cifrado ni verificación |
| AP-03 | ALTO | Despliegue | No hay procedimiento de actualización ni de vuelta atrás; migraciones irreversibles y sin bloqueo |
| AP-26 | ALTO | Pruebas / Publicación | La versión candidata no pasa la E2E y nunca pasó por CI; `main` (`v1.0.5`) está en rojo |
| AP-27 | MEDIO | Funcionalidad / API | El subtipo de asamblea elegido en el formulario no se guarda |
| AP-04 | MEDIO | Resiliencia / Base de datos | Sin tiempo límite en consultas ni en la cola del pool; la salud puede quedar colgada |
| AP-05 | MEDIO | Integridad / Trazabilidad | 30 operaciones registran su auditoría fuera de la transacción |
| AP-06 | MEDIO | Seguridad / Autenticación | Cuentas de administración sin segundo factor; el bloqueo se elude rotando IP |
| AP-07 | MEDIO | Dependencias | Servicio de WhatsApp con 7 avisos altos en producción y librería no oficial |
| AP-08 | MEDIO | Observabilidad | Sin métricas, alertas de errores ni vigilancia de disco |
| AP-09 | BAJO | Concurrencia | `updateLote` lee el lote fuera de la transacción (actualización perdida) |
| AP-10 | BAJO | Integridad / Reglas de negocio | Anular un pago anual tras transferir el lote devuelve la deuda al titular anterior |
| AP-11 | BAJO | Seguridad / Frontend | Token de sesión en `localStorage`/`sessionStorage` |
| AP-12 | BAJO | Base de datos | `intentos_login` crece sin purga y los intentos no caducan |
| AP-13 | BAJO | Infraestructura | El usuario de la aplicación recibe `ALL PRIVILEGES` |
| AP-14 | BAJO | Dependencias | Avisos en herramientas de desarrollo (vite, undici, minimatch) |
| AP-15 | BAJO | Pruebas | La cobertura del frontend no se puede medir |
| AP-16 | BAJO | Seguridad / Repositorio | Credenciales de desarrollo en el historial de git |
| AP-17 | BAJO | Rendimiento | La auditoría se ordena por `fecha` sin índice propio |
| AP-18 | BAJO | Seguridad / Sesiones | La revocación de tokens compara el reloj de Node con el de MySQL |
| AP-19 | BAJO | Infraestructura | El servicio de WhatsApp no tiene unidad de servicio ni reinicio automático |
| AP-25 | BAJO | Rendimiento | `bcryptjs` calcula en el hilo principal: los inicios de sesión simultáneos frenan a todos |
| AP-20 | INFORMATIVO | Escalabilidad | Límite de intentos en memoria: una sola instancia |
| AP-21 | INFORMATIVO | Seguridad / Cabeceras | CSP con `style-src 'unsafe-inline'` |
| AP-22 | INFORMATIVO | Autenticación | La recuperación de contraseña solo la hace un administrador |
| AP-23 | INFORMATIVO | Privacidad | Cumplimiento de la LOPDP no evaluado |
| AP-24 | INFORMATIVO | Frontend / Build | Advertencias de módulos CommonJS en el build |

---

## ALTO

### AP-01 — Actualizar desde `v1.0.5` altera los datos de cobro

- **Categoría:** Base de datos, reglas de negocio.
- **Descripción:** la versión candidata cambia el pago anual de agua de cuota fija por lote a valor por hectárea. Dos efectos llegan a los datos reales al migrar un servidor que ya tiene `v1.0.5`:
  1. La migración `031` escribe 10.000 m² (1 ha) en todo lote real cuya superficie esté vacía y lo marca como "Superficie provisional de demostración". Desde ese momento el control que bloquea la facturación de lotes sin superficie (`lotes_sin_superficie`, HTTP 409) ya no encuentra ninguno: el cobro se emite sobre una superficie inventada.
  2. La tarifa vigente del concepto `AGUA_ANUAL` no se convierte. En `main` su valor es la cuota de cada lote; en `develop` el mismo número se multiplica por las hectáreas. Una tarifa de, por ejemplo, 25 USD por lote pasa a cobrar 25 USD por hectárea.
- **Evidencia:**
  - `backend/database/migrations/031_lotes_superficie_provisional.js:4-13` (`UPDATE lotes SET superficie_m2 = ? WHERE superficie_m2 IS NULL`).
  - `backend/src/services/finanzasService.js:196-202` (`valorHectareaAgua` lee la misma tarifa) y `:227-237` (control de lotes sin superficie).
  - `git show main:backend/src/services/finanzasService.js`, líneas 185-197: en `v1.0.5` la tarifa es `valorAnualAgua`, un total por lote.
  - `git ls-tree main backend/database/migrations/` termina en `030`: `031` y `032` no están publicadas.
- **Impacto:** Alto (cobros incorrectos a usuarios reales y deuda que luego hay que anular).
- **Probabilidad:** Media. La pantalla de facturación tiene un paso de simulación que muestra el total; un administrador atento lo detecta, pero nada le avisa.
- **Consecuencia en producción:** obligaciones anuales con valores erróneos para el año siguiente y reclamos de los usuarios; un dato de demostración queda mezclado con el catastro real.
- **Recomendación:** que la migración no invente superficies en una base con datos (dejar `NULL` y que el control 409 haga su trabajo), o que solo lo haga si `NODE_ENV` no es `production`. Agregar una migración o un paso guiado que cierre la tarifa `AGUA_ANUAL` por lote e invite a registrar la nueva por hectárea, y avisar en el panel cuántos lotes tienen superficie provisional.
- **Prioridad:** P0.

### AP-02 — La protección ante pérdida de datos depende de pasos manuales

- **Categoría:** Continuidad del servicio, respaldos.
- **Descripción:** `scripts/respaldo.js` funciona bien como herramienta (usa `--single-transaction`, permisos `0600`, rotación), pero todo lo que protege los datos queda fuera del repositorio y sin comprobación: la programación nocturna, la copia a otro equipo y la prueba mensual de restauración son instrucciones de `docs/operacion.md`. Además:
  - el respaldo no está cifrado y contiene cédulas, teléfonos y pagos;
  - no se verifica la integridad del `.gz` ni se guarda un checksum;
  - la restauración de documentos subidos es un `tar` manual aparte;
  - el único respaldo presente en este equipo es del 2026-10-26, lo que muestra que aquí no corre ninguna tarea programada (es un equipo de desarrollo, así que no prueba nada del servidor).
- **Evidencia:** `scripts/respaldo.js:182-219` (respaldo), `:233-251` (restauración sin documentos); `docs/operacion.md:51-83`; `backups/junta-20261026-173836.sql.gz`.
- **Impacto:** Alto (pérdida irreversible de pagos, multas y padrón).
- **Probabilidad:** Media (los pasos manuales se omiten; nada falla si no se hacen, salvo el aviso de `vigilar.js` si se configuró).
- **Consecuencia en producción:** ante un disco dañado o un borrado accidental, la Junta puede quedarse sin su historial financiero.
- **Recomendación:** entregar el respaldo programado como parte del despliegue (unidad `systemd` + `timer` en `deploy/`), copiarlo fuera del servidor de forma automática y cifrada (`rclone` con cifrado o `age`/`gpg`), verificar el archivo tras crearlo (`gzip -t` y restauración de prueba en una base temporal) y registrar la fecha de la última prueba de restauración.
- **Prioridad:** P0.

### AP-03 — Sin procedimiento de actualización ni de vuelta atrás

- **Categoría:** Despliegue.
- **Descripción:** la documentación explica la primera instalación, pero no cómo publicar una versión nueva en un servidor con datos ni cómo volver a la anterior. Las migraciones solo tienen `up`; el migrador no usa bloqueo (dos procesos pueden migrar a la vez) y una migración `.js` que falla a mitad deja el esquema a medias sin registrarla. En MySQL el DDL hace commit implícito, así que la única vuelta atrás es restaurar un respaldo, que AP-02 no garantiza. La versión que se quiere desplegar (`develop`) no está en `main` ni tiene etiqueta.
- **Evidencia:** `backend/src/db/migrator.js:76-108` (sin `GET_LOCK`, sin `down`); `docs/operacion.md` (secciones 0 a 4, ninguna de actualización); `git tag` (última `v1.0.5`), `git rev-list --count main..develop` = 33.
- **Impacto:** Alto (servicio caído o esquema inconsistente durante una actualización).
- **Probabilidad:** Media.
- **Consecuencia en producción:** una actualización fallida obliga a restaurar a ciegas y puede perder las operaciones del día.
- **Recomendación:** documentar y automatizar la actualización: respaldo previo obligatorio, `git checkout <etiqueta>`, `npm run prod:preparar`, reinicio, comprobación de salud; y la vuelta atrás: etiqueta anterior + restauración del respaldo previo. Tomar `GET_LOCK('junta_migraciones', …)` en el migrador. Publicar en `main` y etiquetar la versión antes de desplegarla.
- **Prioridad:** P0.

### AP-26 — La versión candidata no pasa la E2E y nunca pasó por CI

- **Categoría:** Pruebas, proceso de publicación.
- **Descripción:**
  1. En esta auditoría, `E2E_CHANNEL=chrome npm run test:e2e` sobre `d4a3cdc` terminó con **7 fallidas, 20 sin ejecutar y 158 aprobadas**. Al menos dos fallos son aserciones desactualizadas tras el cambio a hectáreas o de contenido (`'1500 m²'` frente a `'1.500 m² (0,15 ha)'` en `03-sectores-y-lotes.spec.js:64`; texto de la sede repetido en `01-publico.spec.js:61`). Otros no se pudieron clasificar sin depurar y pueden ser regresiones reales del cobro por hectárea: la vista previa de Facturación anual no aparece (`09-finanzas.spec.js:138`), "Mi cuenta" no queda al día tras el cobro (`10-mi-cuenta.spec.js:101`), la auditoría no muestra filas (`13-auditoria.spec.js:22`) y la cuenta de noticias publicadas no coincide (`15-noticias.spec.js:337`). Un fallo encadena otro (`06-turnos.spec.js:14`, `TypeError: Cannot read properties of undefined (reading 'cedula')`) y 20 pruebas no llegan a ejecutarse.
  2. `develop` local (`d4a3cdc`) no está en `origin` (`origin/develop` = `8f8a65f`, 2026-11-07): CI nunca corrió sobre la versión que se quiere desplegar. Los archivos de E2E no se tocan desde el 2026-11-07, antes del cobro por hectárea.
  3. La última ejecución de CI en `main` (`45fc1eb`, `v1.0.5`, 2026-11-11) terminó en **failure** en el trabajo E2E (fallos en `01-publico.spec.js:54`, `04-asambleas.spec.js:219` y `15-noticias.spec.js:318`). La versión publicada como estable no está verde.
- **Evidencia:** salida local de Playwright (resumen "7 failed, 20 did not run, 158 passed (7.1m)"); `git rev-parse origin/develop develop`; `gh run list --workflow ci.yml` (run de `main` del 2026-11-11 con conclusión `failure`, trabajo "E2E (navegador real)").
- **Impacto:** Alto (no se puede afirmar que los flujos principales funcionan en la versión candidata, en particular el cobro). **Probabilidad:** Alta (los fallos ocurren hoy).
- **Consecuencia en producción:** se desplegaría una versión con flujos de cobro sin verificar de extremo a extremo.
- **Recomendación:** depurar cada fallo y clasificarlo (prueba desactualizada o regresión); corregir las regresiones y actualizar las pruebas; publicar `develop` y exigir CI verde (incluida E2E) como protección de rama en `main` y `develop`.
- **Prioridad:** P0.

---

## MEDIO

### AP-27 — El subtipo de asamblea elegido en el formulario no se guarda

- **Categoría:** Funcionalidad, API.
- **Descripción:** el formulario de asamblea permite elegir "Ordinaria" o "Extraordinaria", pero `INSERT INTO eventos` no tiene columna para ello y el dato se pierde. El portal público clasifica las asambleas buscando la palabra "extraordinaria" en el título. Es el caso de "parece funcionar en la interfaz pero falla en el backend": la propia E2E lo marca como fallo conocido.
- **Evidencia:** `backend/src/services/eventosService.js:378-386` (comentario y filtro `e.titulo LIKE '%extraordinaria%'`), `:460-464` (`INSERT` sin subtipo); `e2e/tests/04-asambleas.spec.js:219-226` (`test.fail(true, 'El subtipo de la asamblea no se persiste…')`).
- **Impacto:** Medio (actas y convocatorias con el tipo equivocado; filtro público incorrecto). **Probabilidad:** Alta.
- **Recomendación:** columna `subtipo ENUM('ORDINARIA','EXTRAORDINARIA')` con migración que la deduzca del título para los datos existentes, guardarla al crear y editar, y filtrar por ella.
- **Prioridad:** P2.

### AP-04 — Sin tiempo límite en consultas ni en la cola del pool

- **Categoría:** Resiliencia, base de datos.
- **Descripción:** el pool de `mysql2` tiene `connectionLimit: 10`, `queueLimit: 0` (cola infinita) y ningún tiempo límite de consulta. Si MySQL deja de responder sin cerrar la conexión (disco lleno, bloqueo de tablas), cada petición espera indefinidamente y la cola crece en memoria. `/api/health` hace `SELECT 1` sin tiempo límite, así que tampoco responde: el proxy lo marca caído, pero `systemd` no reinicia nada porque el proceso sigue vivo.
- **Evidencia:** `backend/src/config/db.js:4-18`; `backend/src/app.js:61-68`.
- **Impacto:** Medio (servicio sin respuesta hasta intervención manual). **Probabilidad:** Baja.
- **Recomendación:** `queueLimit` acotado, `connectTimeout`, tiempo límite por consulta (`timeout` de `mysql2` o `MAX_EXECUTION_TIME`) y un `Promise.race` de 2-3 s en `/api/health`.
- **Prioridad:** P1.

### AP-05 — 30 operaciones registran su auditoría fuera de la transacción

- **Categoría:** Integridad, trazabilidad.
- **Descripción:** `auditService.js` declara que pagos, anulaciones y cambios de cuenta guardan su rastro en la misma transacción, y así lo hacen finanzas y personas. Pero 33 llamadas a `registrarAuditoria` se hacen después del commit, en modo "mejor esfuerzo": si el `INSERT` en `auditoria` falla, la operación queda hecha sin rastro y solo se escribe en el log. Tres son de autenticación (por diseño); las otras 30 incluyen finalizar un evento (que genera las multas), registrar asistencias, transferir la titularidad de un lote (que mueve deuda) y corregir la superficie (que recalcula cuotas).
- **Evidencia:** `eventoController.js` líneas 60, 72, 88, 101, 130, 142, 170, 219, 282, 299; `loteController.js` 132, 147, 164, 243, 293, 349; `mingaController.js` 29, 40, 62; `turnoController.js` 86, 98, 112; `planificacionController.js` 64, 82, 118; `inventarioController.js` 52, 90; `whatsappController.js` 30, 45, 56. Contrato en `services/auditService.js:6-11`.
- **Impacto:** Medio (multas o traspasos de deuda sin registro de quién los hizo). **Probabilidad:** Baja (requiere que falle solo el `INSERT` de auditoría).
- **Recomendación:** usar `conAuditoria` o pasar `conexion` en las operaciones que crean o mueven dinero (finalizar evento, asistencias, transferencia de lote, recálculo de cuotas).
- **Prioridad:** P2.

### AP-06 — Administración sin segundo factor; bloqueo eludible rotando IP

- **Categoría:** Seguridad, autenticación.
- **Descripción:** el bloqueo es por par cuenta + IP (5 intentos, 15 min) y el límite de `express-rate-limit` es por IP. Quien disponga de muchas IP puede probar contraseñas de una cuenta ADMIN sin que se bloquee. La política de contraseñas (10 caracteres, letras y números, lista de comunes) reduce el riesgo, pero no hay segundo factor para las cuentas que manejan el dinero. Además, el contador de intentos no caduca: cuatro errores de hace un mes y uno hoy bloquean la cuenta.
- **Evidencia:** `backend/src/controllers/authController.js:53-74`, `:93-105`; `backend/src/routes/authRoutes.js:18-29`; `migrations/029_intentos_login.js:5-14` (sin ventana temporal).
- **Impacto:** Alto (control total de finanzas y padrón). **Probabilidad:** Baja (requiere un ataque dirigido y distribuido).
- **Recomendación:** TOTP opcional y luego obligatorio para ADMIN; un límite global por cuenta (todas las IP) que alerte y aplique retraso progresivo; reiniciar `intentos` si `updated_at` es anterior a la ventana.
- **Prioridad:** P2.

### AP-07 — Servicio de WhatsApp con avisos altos y librería no oficial

- **Categoría:** Dependencias, cadena de suministro.
- **Descripción:** `npm audit --omit=dev` en `whatsapp-service/` informa 12 avisos (7 altos, 5 moderados), todos transitivos de `whatsapp-web.js` → `puppeteer`: `extract-zip` (escritura de archivos por enlaces simbólicos, GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv), `zod` (consumo de memoria, GHSA-mrhx-c7xc-m3w5), `glob`, `archiver`. El riesgo explotable es bajo: el servicio escucha en `127.0.0.1`, exige token comparado en tiempo constante y `extract-zip` solo actúa al descargar el navegador. El riesgo operativo es otro: `whatsapp-web.js` automatiza WhatsApp Web sin API oficial y el número de la Junta puede ser bloqueado.
- **Evidencia:** `whatsapp-service/package.json`; `npm audit --omit=dev` (12 avisos); `whatsapp-service/src/app.js:5-27`; `docs/operacion.md:136-145` (riesgo ya aceptado).
- **Impacto:** Medio (las convocatorias dejan de salir; el resto del sistema sigue). **Probabilidad:** Media.
- **Recomendación:** mantener el riesgo aceptado por escrito, revisar en cada versión de `whatsapp-web.js`, instalar con `PUPPETEER_SKIP_DOWNLOAD` y un Chrome del sistema, y valorar la API oficial de WhatsApp Business si las convocatorias se vuelven críticas.
- **Prioridad:** P2.

### AP-08 — Sin métricas, alertas de errores ni vigilancia de disco

- **Categoría:** Observabilidad.
- **Descripción:** hay buena base (registro JSON con `reqId`, peticiones lentas a más de 2 s, `X-Request-Id`, `scripts/vigilar.js` con webhook), pero solo detecta "el sistema no responde" y "el respaldo es viejo". No hay alerta por aumento de errores 5xx, ni vigilancia del espacio en disco (MySQL, `uploads/`, `backups/`), ni registro fuera del servidor. Con el disco lleno MySQL se detiene y los respaldos fallan.
- **Evidencia:** `backend/src/middlewares/requestLogger.js:12-38`; `scripts/vigilar.js:1-40`; `deploy/junta-backend.service.example` (vigilante comentado, opcional).
- **Impacto:** Medio. **Probabilidad:** Media.
- **Recomendación:** activar el vigilante con webhook como parte del despliegue, agregarle una comprobación de espacio libre y un umbral de errores 5xx (contando en el log o con un contador expuesto), y un monitor externo (UptimeRobot o similar) contra `/api/health`.
- **Prioridad:** P1.

---

## BAJO

### AP-09 — `updateLote` lee el lote fuera de la transacción

- **Descripción:** el lote se lee con `db.query` sin bloqueo y luego se escribe en una transacción con todos los campos. Dos ediciones simultáneas se pisan, y el recálculo de cuotas compara con una superficie que pudo cambiar.
- **Evidencia:** `backend/src/controllers/loteController.js:254-291`.
- **Impacto:** Medio. **Probabilidad:** Baja (pocos administradores). **Recomendación:** leer con `SELECT … FOR UPDATE` dentro de la transacción. **Prioridad:** P3.

### AP-10 — Anular un pago anual tras transferir el lote devuelve la deuda al titular anterior

- **Descripción:** la transferencia mueve solo las cuotas PENDIENTES. Si después se anula un pago del titular anterior, su cuota vuelve a PENDIENTE a nombre de quien ya no tiene el lote.
- **Evidencia:** `backend/src/services/finanzasService.js:330-337` y `:413-431`.
- **Impacto:** Medio. **Probabilidad:** Baja. **Recomendación:** al anular, reasignar la cuota al titular actual del lote o pedir confirmación. **Prioridad:** P3.

### AP-11 — Token de sesión en el almacenamiento del navegador

- **Descripción:** el JWT se guarda en `localStorage` ("recordar sesión") o `sessionStorage`. Un XSS podría leerlo. Está mitigado: CSP `script-src 'self'`, sin `innerHTML` ni `bypassSecurityTrust` en el frontend, plantillas de Angular que escapan, expiración de 8 h y revocación en el servidor al cerrar sesión.
- **Evidencia:** `frontend/src/app/core/auth/session.ts:14-110`; `backend/src/app.js:34-52`.
- **Impacto:** Alto. **Probabilidad:** Baja. **Recomendación:** a medio plazo, cookie `HttpOnly; Secure; SameSite=Strict` con protección CSRF. **Prioridad:** P3.

### AP-12 — `intentos_login` crece sin purga

- **Descripción:** cada par cuenta/IP con un fallo deja una fila que solo se borra con un ingreso correcto desde esa IP o un desbloqueo. Con IP móviles cambiantes la tabla crece sin límite.
- **Evidencia:** `backend/src/controllers/authController.js:65-74`, `:109`.
- **Recomendación:** purga periódica de filas con `updated_at` antiguo (junto con la caducidad de AP-06). **Prioridad:** P3.

### AP-13 — El usuario de la aplicación recibe `ALL PRIVILEGES`

- **Descripción:** la guía crea `junta_app` con `GRANT ALL PRIVILEGES ON junta_las_jones.*`, que incluye `DROP`. La aplicación necesita DDL solo al migrar.
- **Evidencia:** `docs/operacion.md:15-21`.
- **Recomendación:** usuario de migración con DDL y usuario de ejecución con `SELECT, INSERT, UPDATE, DELETE`. **Prioridad:** P3.

### AP-14 — Avisos en herramientas de desarrollo

- **Descripción:** `npm audit` completo informa 5 moderados en `backend` (eslint/minimatch, nodemon) y 14 en `frontend` (2 altos: `vite` y `undici`, usados por el servidor de desarrollo y el build). Con `--omit=dev`, `backend` y `frontend` tienen **0** avisos. No llegan al servidor, pero afectan a los equipos de desarrollo.
- **Evidencia:** `npm audit` en cada paquete (2026-11-12).
- **Recomendación:** aplicar las actualizaciones de Dependabot pendientes (`@angular/build` 22.2.6 corrige `vite`). **Prioridad:** P3.

### AP-15 — La cobertura del frontend no se puede medir y hay operaciones destructivas sin prueba

- **Descripción:** `ng test --coverage` falla porque falta `@vitest/coverage-v8`. Hay 274 pruebas unitarias que pasan, pero no se sabe qué parte del código cubren. En CI no se mide cobertura en ningún paquete. En el backend la cobertura medida es alta (96,89 % de líneas), pero la eliminación física de una persona (`deletePersona`) no la ejecuta ninguna prueba, igual que parte de las ramas de cambio de cédula y de estado de cuenta.
- **Evidencia:** salida de `ng test --watch=false --coverage`: "Code coverage requires either "@vitest/coverage-v8" or "@vitest/coverage-istanbul" to be installed."; `node --test --experimental-test-coverage` en `backend/`: `personaController.js` 86,96 % de líneas, sin cubrir 392-430 (`deletePersona`), 350-363 y 464-466.
- **Recomendación:** agregar `@vitest/coverage-v8`, publicar la cobertura de backend y frontend en CI y escribir pruebas de integración para `DELETE /api/personas/:id` (con y sin historial). **Prioridad:** P3.

### AP-16 — Credenciales de desarrollo en el historial de git

- **Descripción:** `backend/database/fix_password.sql` y `seed.sql` (borrados en 2026-10-03) contenían el hash de una contraseña de desarrollo y la cédula del administrador de ejemplo. El código actual ya no los usa y `env.js` bloquea el `JWT_SECRET` que estuvo publicado.
- **Evidencia:** `git log --all -- backend/database/fix_password.sql backend/database/seed.sql` (commits `fe5fcfc`, `b30e936`, `af79d3b`).
- **Recomendación:** confirmar que ninguna base de producción se creó con esos scripts (buscar la cédula `1800000001` en `personas`). **Prioridad:** P3.

### AP-17 — La auditoría se ordena por `fecha` sin índice propio

- **Descripción:** `GET /api/auditoria` ordena por `a.fecha DESC, a.id DESC` y filtra por fecha o acción, pero los índices son `(entidad, entidad_id)` y `(cuenta_id, fecha)`. La tabla crece con cada petición que modifica datos y con cada inicio de sesión.
- **Evidencia:** `backend/src/controllers/auditoriaController.js:26-36`; `001_baseline.sql:398-409`.
- **Recomendación:** índice `(fecha, id)` y, si hace falta, `(accion, fecha)`. **Prioridad:** P3.

### AP-18 — La revocación de tokens compara relojes distintos

- **Descripción:** el token guarda `ts = Date.now()` (reloj de Node) y se compara con `password_updated_at` y `sesiones_validas_desde`, escritos con `UTC_TIMESTAMP(3)` (reloj de MySQL). Si la base corre en otro equipo con el reloj adelantado, el token nuevo emitido justo después de cambiar la contraseña se rechaza.
- **Evidencia:** `backend/src/middlewares/authMiddleware.js:50-56`; `authController.js:142`, `:162`.
- **Recomendación:** escribir esas marcas con la hora de Node o tolerar unos segundos de desfase; mantener NTP en ambos equipos. **Prioridad:** P3.

### AP-19 — El servicio de WhatsApp no tiene unidad de servicio

- **Descripción:** `deploy/` trae unidad `systemd` para el backend y el vigilante, pero no para `whatsapp-service`. Con `npm run prod` se lanza como proceso hijo y, si cae, no se reinicia.
- **Evidencia:** `deploy/junta-backend.service.example`; `scripts/prod.js:119-123`.
- **Recomendación:** agregar `deploy/junta-whatsapp.service.example` con `Restart=always`. **Prioridad:** P3.

### AP-25 — `bcryptjs` calcula en el hilo principal

- **Descripción:** `bcryptjs` es JavaScript puro y corre en el hilo de eventos de Node. Medido en el equipo de desarrollo (16 hilos), una comparación con costo 10 tarda unos 118 ms. Cada inicio de sesión (y cada cédula inexistente, por el hash ficticio) ocupa ese tiempo el único hilo que atiende todas las peticiones: 50 ingresos simultáneos suman unos 6 s de espera para todos los usuarios. Es una estimación a partir de esa medida, no una prueba de carga.
- **Evidencia:** `backend/src/shared/passwords.js:2`, `:31-35`; medida local: `bcrypt.compare` 117,6 ms por operación (10 repeticiones).
- **Impacto:** Medio. **Probabilidad:** Baja (picos de ingreso tras una convocatoria). **Recomendación:** cambiar a `bcrypt` nativo (usa el pool de libuv) o a `crypto.scrypt` asíncrono, con migración transparente del hash al iniciar sesión. **Prioridad:** P3.

---

## INFORMATIVO

- **AP-20 — Límite de intentos en memoria.** `express-rate-limit` usa su almacén en memoria: se reinicia al reiniciar el proceso y no se comparte entre instancias. Correcto para un único servidor; si se escala a varias instancias, hay que moverlo a Redis o a MySQL (`backend/src/routes/authRoutes.js:18-29`).
- **AP-21 — CSP con estilos en línea.** `style-src 'self' 'unsafe-inline'` es necesario para Angular y Leaflet; el riesgo es menor que con scripts (`backend/src/app.js:41`).
- **AP-22 — Recuperación de contraseña.** No hay recuperación por correo: la hace un administrador (contraseña temporal) o, para un administrador, `npm run db:reset-admin` en el servidor. Es coherente con usuarios sin correo, pero hay que tener siempre dos administradores activos (`docs/operacion.md:29-38`).
- **AP-23 — Privacidad.** El sistema trata cédulas, teléfonos, direcciones y pagos. Existe la página `/privacidad`; el cumplimiento de la Ley Orgánica de Protección de Datos Personales (consentimiento, responsable, plazos de conservación) no se evaluó: es un análisis legal.
- **AP-24 — Advertencias del build.** `ng build` termina bien con avisos de módulos CommonJS (`canvg` de `jspdf`, `leaflet`). Afectan a la optimización, no al funcionamiento.

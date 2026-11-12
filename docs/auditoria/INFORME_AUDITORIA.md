# Informe de auditoría de preparación para producción

- **Sistema:** Sistema Integrado de Gestión de la Junta de Agua y Riego La Jones (Patate).
- **Fecha:** 2026-11-12.
- **Versión auditada:** rama `develop`, commit `d4a3cdc`. Está 33 commits por delante de `main` (`45fc1eb`, etiqueta `v1.0.5`) e incluye el cambio del pago anual de agua a valor por hectárea.
- **Documentos relacionados:** [`HALLAZGOS.md`](HALLAZGOS.md), [`PLAN_CORRECCION.md`](PLAN_CORRECCION.md), [`CHECKLIST_PRODUCCION.md`](CHECKLIST_PRODUCCION.md).

## 1. Veredicto

**APTO CONDICIONALMENTE.**

No se encontró ninguna vulnerabilidad crítica ni explotable desde fuera en el código. La seguridad de la aplicación, la validación en el servidor, las transacciones de las operaciones con dinero y la batería de pruebas están por encima de lo habitual en un proyecto de este tamaño. Lo que impide aprobarlo sin condiciones está en cuatro riesgos ALTOS, ninguno de ellos un fallo de seguridad:

1. **AP-01:** actualizar un servidor que ya tiene `v1.0.5` a esta versión altera los datos de cobro (superficie de 1 ha inventada en lotes reales y tarifa por lote reinterpretada como tarifa por hectárea).
2. **AP-02:** la protección contra la pérdida de datos (respaldo programado, copia externa, prueba de restauración) depende de pasos manuales que el repositorio no garantiza ni verifica.
3. **AP-03:** no hay procedimiento de actualización ni de vuelta atrás, y las migraciones son irreversibles.
4. **AP-26:** la versión candidata falla 7 pruebas E2E (20 más no llegan a ejecutarse), nunca pasó por CI porque no está publicada, y la última ejecución de CI sobre `main` (`v1.0.5`) también está en rojo.

Con las tareas P0 del plan resueltas y la lista de comprobación completada en el servidor, el veredicto pasaría a APTO.

## 2. Descripción del proyecto

Aplicación web para una junta de agua de riego rural: padrón de usuarios y lotes, catastro con mapa, turnos de riego por sector, asambleas y mingas con asistencia, multas automáticas por ausencia, cobro anual de agua por lote (ahora por hectárea), pagos con comprobantes, egresos, inventario, plan anual, noticias públicas, auditoría de acciones y convocatorias por WhatsApp. Dos roles: `ADMIN` (la directiva) y `USUARIO` (consulta su propia información).

## 3. Arquitectura detectada

| Componente | Tecnología | Detalle |
|---|---|---|
| Frontend | Angular 22.2, TypeScript 6.0, Leaflet, jsPDF | SPA con componentes standalone, rutas perezosas, guard por rol, interceptores de sesión y de errores |
| Backend | Node.js 26, Express 5.2, Zod 4, mysql2 3.24 | API REST en `/api`, capas rutas → controladores → servicios, `withTransaction`, manejador de errores central, registro JSON con `reqId` |
| Base de datos | MySQL 8.0 | 32 migraciones versionadas (`schema_migrations`), InnoDB, claves foráneas y restricciones únicas |
| Servicio de WhatsApp | Express 5 + `whatsapp-web.js` (Puppeteer) | Proceso aparte en `127.0.0.1:3100`, autenticado con token compartido; opcional |
| Despliegue | `scripts/prod.js`, `systemd`, Caddy o Nginx | El backend sirve el frontend compilado desde el mismo origen; HTTPS en el proxy |
| CI | GitHub Actions | Lint, pruebas de backend con MySQL, WhatsApp, frontend, build y E2E con Playwright; `npm audit` semanal; Dependabot |

Flujo: navegador → Caddy/Nginx (HTTPS) → Express (`127.0.0.1:3000`) → MySQL (`127.0.0.1:3306`); Express → servicio de WhatsApp (`127.0.0.1:3100`) → WhatsApp Web. No hay contenedores de aplicación: Docker solo se usa para MySQL en desarrollo (`bd/docker-compose.yml`).

## 4. Alcance

Revisado: todo el código de `backend/src`, las 32 migraciones, `whatsapp-service/src`, la configuración, guards, interceptores y sesión del frontend, `scripts/`, `deploy/`, `bd/`, `.github/`, `.gitignore`, el historial de git (búsqueda de secretos) y la documentación de operación.

No revisado o no verificable desde el repositorio:

- El servidor real: firewall, certificados, `.env` de producción, tareas programadas, espacio en disco, versión de MySQL.
- Pruebas de carga y tiempos de respuesta en producción (no se ejecutaron; el rendimiento se evaluó por arquitectura).
- Compatibilidad manual en navegadores (las E2E usan Chrome y vistas móviles emuladas).
- Revisión línea por línea de cada componente del frontend: se revisaron la sesión, el control de acceso y los sumideros de XSS; los flujos de pantalla los cubren las E2E.
- Cumplimiento legal de protección de datos (LOPDP).

## 5. Metodología

1. Lectura del código siguiendo los flujos de ejecución (autenticación, autorización por endpoint, pagos, anulaciones, multas, transferencia de lotes, documentos subidos).
2. Comprobación de cada endpoint con autenticación pero sin rol de administrador para buscar IDOR.
3. Revisión de esquema, restricciones, índices y migraciones; comparación de `main` contra `develop` en las reglas de cobro.
4. Ejecución de herramientas en el equipo de desarrollo (Windows 11, Node 26.8.1, MySQL 8.0 en Docker), siempre contra bases de prueba aisladas (`junta_las_jones_test`, `junta_las_jones_e2e`), nunca contra datos reales.
5. Clasificación de cada hallazgo por impacto y probabilidad en el contexto real del sistema.

No se modificó código fuente ni configuración, no se ejecutaron migraciones sobre bases con datos y no se hicieron pruebas contra sistemas externos.

## 6. Resultados de las herramientas

| Verificación | Comando | Resultado |
|---|---|---|
| Lint backend | `npm --prefix backend run lint` | PASS (0 errores) |
| Lint WhatsApp | `npm --prefix whatsapp-service run lint` | PASS |
| Lint frontend | `ng lint` | PASS ("All files pass linting.") |
| Formato frontend | `prettier --check` | PASS |
| Pruebas backend | `node --test --test-concurrency=1 --experimental-test-coverage` | PASS: 220/220, 0 fallos (454 s) |
| Cobertura backend | ídem | líneas 96,89 %, ramas 86,32 %, funciones 96,39 % |
| Pruebas WhatsApp | `npm test` | PASS: 28/28 |
| Pruebas frontend | `ng test --watch=false` | PASS: 274/274 en 40 archivos |
| Cobertura frontend | `ng test --coverage` | NO MEDIBLE: falta `@vitest/coverage-v8` (AP-15) |
| Build producción | `ng build` | PASS, inicial 755,29 kB (162,37 kB transferidos), avisos CommonJS (AP-24) |
| E2E | `E2E_CHANNEL=chrome npm run test:e2e` | FAIL: 158 aprobadas, 7 fallidas, 20 sin ejecutar (7,1 min) (AP-26) |
| CI en `main` | `gh run list --workflow ci.yml` | FAIL: run del 2026-11-11 sobre `v1.0.5`, trabajo E2E |
| CI en la versión candidata | `git rev-parse origin/develop` | NO EJECUTADO: `d4a3cdc` no está publicado |
| Vulnerabilidades (producción) | `npm audit --omit=dev` | backend 0, frontend 0, WhatsApp 12 (7 altas, 5 moderadas) |
| Vulnerabilidades (todo) | `npm audit` | backend 5 moderadas (dev), frontend 14 (2 altas: `vite`, `undici`, dev), e2e 0 |
| Secretos en historial | `git log --all` | Hash de contraseña de desarrollo y cédula de ejemplo en scripts borrados (AP-16); ningún `.env`, clave ni volcado versionado |

## 7. Puntajes

Los puntajes resumen la evidencia de las secciones anteriores; no son una medida externa.

| Categoría | Evaluación | Justificación |
|---|---|---|
| Arquitectura | 80/100 | Capas claras, servicios reutilizables, transacciones con bloqueo pesimista, errores centralizados. Controladores grandes (`personaController.js` 537 líneas) y criterio de auditoría transaccional aplicado a medias (AP-05). |
| Seguridad | 80/100 | CSP estricta, JWT con algoritmo fijo y revocación en el servidor, bcrypt, bloqueo y límites de intentos, validación de archivos por firma binaria, nombres de archivo generados por el servidor, IDOR probado, 0 avisos en dependencias de producción del backend y del frontend. Sin segundo factor para ADMIN (AP-06), token en almacenamiento del navegador (AP-11), dependencias del servicio de WhatsApp (AP-07). |
| Backend y API | 82/100 | Validación Zod en el servidor, respuestas homogéneas `{ status, message }`, paginación con máximo 100, límites de cuerpo y de archivo, Swagger fuera de producción. Sin tiempos límite de base de datos (AP-04). |
| Frontend | 75/100 | Guard por rol en rutas padre e hijas, interceptor que no filtra el token a terceros, sin `innerHTML`, pruebas de accesibilidad con axe en ambos temas, build correcto. Cobertura desconocida (AP-15); la revisión de pantallas se apoya en las E2E. |
| Base de datos | 65/100 | Claves foráneas, únicas que impiden doble cobro (`pago_detalles.obligacion_id`, lote/año), `FOR UPDATE` en pagos y turnos. Migración que inventa datos y reinterpreta la tarifa (AP-01), migraciones irreversibles y sin bloqueo (AP-03), índice faltante (AP-17). |
| Pruebas y QA | 70/100 | 522 pruebas unitarias y de integración en verde, cobertura alta y medida en el backend, pruebas de autorización y de reglas de negocio. Pero la E2E falla en la versión candidata y en `main` (AP-26), la candidata no pasó por CI, sin cobertura del frontend, `deletePersona` sin prueba y sin pruebas de carga. |
| Rendimiento | N/E | No se ejecutaron pruebas de carga. Ver la estimación de la sección 9. |
| Infraestructura | 60/100 | Ejemplos de `systemd`, Caddy y Nginx correctos, escucha en `127.0.0.1`, validación de configuración al preparar, guía de servidor detallada. Respaldos y actualización manuales sin verificación (AP-02, AP-03), WhatsApp sin unidad de servicio (AP-19). |
| Observabilidad | 60/100 | Registro JSON con identificador de petición y aviso de peticiones lentas; vigilante con webhook y control de antigüedad del respaldo. Sin métricas, alertas de errores ni de disco (AP-08). |
| Mantenibilidad | 82/100 | Lint y Prettier en CI, Dependabot, Conventional Commits, documentación de API, base de datos y operación. Varias PR de Dependabot sin integrar (AP-14). |

## 8. Hallazgos

Total: 0 críticos, 4 altos, 6 medios, 12 bajos y 5 informativos. El detalle con evidencia, archivo y línea está en [`HALLAZGOS.md`](HALLAZGOS.md).

### Riesgos principales

| ID | Severidad | Riesgo | Consecuencia en producción |
|---|---|---|---|
| AP-01 | ALTO | La actualización inventa superficies y reinterpreta la tarifa del agua | Cobros anuales erróneos a usuarios reales |
| AP-02 | ALTO | Respaldo sin automatizar, cifrar ni verificar | Pérdida irreversible del historial financiero |
| AP-03 | ALTO | Sin procedimiento de actualización ni vuelta atrás | Servicio caído o esquema a medias tras una actualización |
| AP-26 | ALTO | E2E en rojo; candidata sin CI | Flujos de cobro sin verificar de extremo a extremo |
| AP-27 | MEDIO | El subtipo de asamblea se pierde | Convocatorias y filtro público con el tipo equivocado |
| AP-04 | MEDIO | Base de datos sin tiempos límite | El sistema deja de responder sin reiniciarse |
| AP-05 | MEDIO | Auditoría fuera de la transacción en 30 operaciones | Multas o traspasos de deuda sin rastro |
| AP-06 | MEDIO | ADMIN sin segundo factor | Toma de control de las finanzas con un ataque dirigido |
| AP-08 | MEDIO | Sin alertas de errores ni disco | Fallas que se descubren por los usuarios |

### Lo que está bien resuelto

Se comprobó en el código, y en la mayoría de los casos también con pruebas, que:

- Ningún endpoint con datos personales responde sin sesión; los endpoints de usuario limitan la consulta a la propia persona (`personaPermitida`, comprobaciones de `getPersonaById`, `consultaPublicaPorCedula`, comprobantes de pago).
- Todas las consultas SQL usan parámetros; los identificadores dinámicos vienen de listas fijas (`TABLAS` en `pagoComprobanteController.js`) o de una expresión regular (`DB_NAME`).
- Los archivos subidos se validan por firma binaria, se guardan con nombre generado (`UUID`) y se sirven con control de acceso, `nosniff` y protección contra recorrido de rutas.
- Pagos, anulaciones, multas, transferencias de lote y turnos usan transacciones con `SELECT … FOR UPDATE`; las restricciones únicas impiden cobrar dos veces la misma obligación o emitir dos cuotas del mismo lote y año.
- El inicio de sesión tarda lo mismo exista o no la cédula, responde siempre el mismo mensaje y bloquea por cuenta e IP.
- El cierre de sesión, el cambio de contraseña y el restablecimiento invalidan los tokens anteriores en el servidor; el rol se lee de la base en cada petición.
- No se pueden sembrar datos de prueba ni borrar la base con `NODE_ENV=production`, y `prod.js` rechaza contraseñas de ejemplo.

## 9. Rendimiento y escalabilidad (estimación)

**Estas cifras son estimaciones arquitectónicas, no resultados de pruebas de carga.** La única medida tomada es el costo de `bcrypt.compare` con `bcryptjs` y costo 10: 117,6 ms por operación en el equipo de desarrollo.

Supuestos: un proceso de Node, pool de 10 conexiones MySQL, cada petición autenticada hace una consulta para validar la cuenta, consultas simples con índices, conjunto de datos de cientos de usuarios y lotes.

| Usuarios simultáneos | Estimación |
|---|---|
| 10 | Sin problemas. Respuestas dominadas por MySQL (decenas de ms). |
| 50 | Adecuado para la navegación. Si los 50 inician sesión a la vez, el hilo principal queda ocupado unos 6 s por `bcryptjs` y todas las peticiones esperan (AP-25). |
| 100 | Navegación aceptable; el pool de 10 conexiones empieza a encolar en los listados con subconsultas (`GET /api/personas`, reportes financieros). Un pico de ingresos supone unos 12 s de espera. |
| 500 | Fuera del uso previsto para una junta de este tamaño. Cola en el pool sin límite (AP-04), límite de 100 intentos de inicio de sesión cada 15 min por IP (una red compartida lo alcanza) y un solo proceso. Necesitaría prueba de carga real, `bcrypt` nativo, más conexiones y, quizá, varias instancias con el límite de intentos en un almacén compartido (AP-20). |

El frontend carga 162 kB transferidos en la primera visita; `jspdf` y `html2canvas` (unos 150 kB transferidos) se cargan solo al generar un PDF.

## 10. Escenarios de fallo

| Escenario | Comportamiento según el código | Evaluación |
|---|---|---|
| La base de datos deja de responder | Si rechaza conexiones: errores 500 y `/api/health` 503. Si se cuelga: peticiones y salud sin respuesta indefinidamente (AP-04) | Parcial |
| El backend se reinicia | Cierre ordenado con `SIGTERM` (termina peticiones, cierra el pool); `systemd` lo reinicia. Las sesiones siguen válidas (JWT). Los contadores de `express-rate-limit` se pierden | Correcto |
| Un usuario pierde la conexión | El interceptor convierte el error en un mensaje comprensible; las operaciones con dinero son transaccionales: o se registran completas o no se registran | Correcto |
| Una solicitud tarda demasiado | Se registra como lenta a partir de 2 s; Nginx corta a 60 s. Sin tiempo límite en MySQL | Parcial |
| Dos usuarios modifican el mismo registro | Pagos, anulaciones, turnos, cuentas y transferencias usan `FOR UPDATE`; la edición de un lote no (AP-09) | Mayormente correcto |
| Se envían datos inválidos | Zod en el servidor rechaza con 400 y mensaje; JSON mal formado 400; cuerpo grande 413 | Correcto |
| Una sesión expira | 401, el frontend limpia la sesión y vuelve al login con `returnUrl` | Correcto |
| Acceso sin permisos | 401/403 en el servidor; probado en `authorization.test.js` y E2E | Correcto |
| El servicio externo (WhatsApp) cae | El backend responde 503 solo en esas operaciones; el resto funciona; tiempo límite de 15 s (60 s al enviar) | Correcto |
| Error durante una operación crítica | Rollback de la transacción; en los comprobantes de pago, el archivo ya guardado se borra (no se verificó en todos los tipos de documento). La auditoría de 30 operaciones va aparte (AP-05) | Mayormente correcto |
| El servidor se queda sin espacio | MySQL se detiene, los respaldos fallan y las subidas dan 500. Nada avisa antes (AP-08) | Deficiente |
| Restaurar un respaldo | `npm run respaldo -- --restaurar … --confirmar` restaura la base; los documentos se restauran a mano; no hay verificación previa del archivo (AP-02) | Parcial |

## 11. Respuesta directa

**¿Desplegaría este proyecto hoy en producción si fuera el responsable técnico? NO.**

No por la calidad del código, que es buena, sino porque hoy:

- desplegar esta versión sobre una instalación existente modificaría datos de cobro reales sin aviso (AP-01);
- no puedo comprobar que exista un respaldo automático, externo y restaurable de la información financiera (AP-02), y sin él cualquier fallo de la actualización es irreversible (AP-03);
- la versión no está publicada en `main` ni etiquetada, así que no hay una versión estable identificable a la que volver;
- la E2E falla en esta versión (7 fallidas, 20 sin ejecutar), entre ellas pruebas del cobro anual y de "Mi cuenta", y tampoco está verde en `main` (AP-26). No puedo afirmar que el flujo de cobro funcione de extremo a extremo.

Las cuatro condiciones se resuelven con poco trabajo (tareas P0 del plan) y ninguna exige rediseñar el sistema. Resueltas, y con la lista de comprobación marcada en el servidor, la respuesta sería SÍ.

# ADR 0001 — Riesgo aceptado de `whatsapp-web.js`

- **Estado:** aceptado.
- **Fecha:** 2026-11-13.
- **Revisión:** en cada actualización de `whatsapp-web.js` y, como mínimo, cada tres meses (próxima: 2027-02-13).
- **Hallazgos relacionados:** AP-07 y AP-19 de [`docs/auditoria/HALLAZGOS.md`](../../auditoria/HALLAZGOS.md).

## Contexto

Las convocatorias a asambleas y mingas se publican en el grupo de WhatsApp de la Junta mediante el servicio `whatsapp-service/`, que usa `whatsapp-web.js`: automatiza WhatsApp Web en un navegador controlado por Puppeteer. No es una API oficial de Meta.

`npm audit --omit=dev` en `whatsapp-service/` informa 12 avisos (7 altos, 5 moderados) el 2026-11-12, todos transitivos de `whatsapp-web.js` → `puppeteer`:

| Paquete | Aviso | Alcance real en este sistema |
|---|---|---|
| `extract-zip` | Escritura de archivos por enlaces simbólicos (GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv) | Solo actúa cuando Puppeteer descarga Chromium. Se instala con `PUPPETEER_SKIP_DOWNLOAD=true` y se usa el navegador del sistema (`CHROME_BIN`) |
| `zod` 3.x (vía `chromium-bidi`) | Consumo de memoria con colecciones enormes (GHSA-mrhx-c7xc-m3w5) | Solo valida mensajes del protocolo del navegador local, no datos de la red |
| `glob`, `minimatch`, `archiver` | Recorrido o denegación de servicio con patrones | Usados por Puppeteer y RemoteAuth con rutas propias, sin entrada de usuarios |

`npm audit fix --force` propone bajar `whatsapp-web.js` a 1.34.2, una versión anterior con sus propios problemas.

## Decisión

Se mantiene `whatsapp-web.js` y se acepta el riesgo, con estas mitigaciones obligatorias:

1. El servicio escucha solo en `127.0.0.1` (`WHATSAPP_HOST`) y exige un token de al menos 32 caracteres comparado en tiempo constante.
2. Se instala con `PUPPETEER_SKIP_DOWNLOAD=true` y usa el Chrome o Chromium del sistema.
3. Corre como el usuario sin privilegios `junta`, con `NoNewPrivileges` y `ProtectSystem=full` ([`deploy/junta-whatsapp.service.example`](../../../deploy/junta-whatsapp.service.example)), y se reinicia solo si se cae.
4. Si el servicio no está disponible, el backend responde 503 solo en las operaciones de WhatsApp; el resto del sistema sigue funcionando.

## Consecuencias

- **Riesgo operativo:** WhatsApp puede bloquear el número de la Junta por usar un cliente no oficial. Por eso las convocatorias no deben depender solo de WhatsApp: el sistema también las publica en el portal y permite descargar el PDF firmado.
- **Revisión:** en cada actualización se vuelve a ejecutar `npm audit --omit=dev` en `whatsapp-service/`; si aparece un aviso que afecte a datos de la red o al token, se reconsidera esta decisión.
- **Alternativa futura:** si las convocatorias por WhatsApp se vuelven críticas, migrar a la API oficial de WhatsApp Business (Cloud API), que requiere un número verificado y tiene costo por conversación.

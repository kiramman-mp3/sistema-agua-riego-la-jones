# Checklist de producción

Lista de comprobación antes de desplegar o actualizar el sistema. Cada punto se marca solo después de comprobarlo en el servidor o en CI, no por existir el código. Las referencias `AP-xx` y `P0-x` están en [`HALLAZGOS.md`](HALLAZGOS.md) y [`PLAN_CORRECCION.md`](PLAN_CORRECCION.md).

Estado al 2026-11-12 (auditoría de `develop` `d4a3cdc`): marcado `[x]` lo comprobado en esta auditoría; `[ ]` lo pendiente o no comprobable desde el repositorio.

## 1. Versión y código

- [x] Lint sin errores en backend, servicio de WhatsApp y frontend; Prettier sin diferencias.
- [x] Pruebas del backend: 220/220 (base `junta_las_jones_test`).
- [x] Pruebas del servicio de WhatsApp: 28/28.
- [x] Pruebas unitarias del frontend: 274/274.
- [x] Build de producción del frontend sin errores.
- [ ] Pruebas E2E en verde sobre la versión exacta que se va a desplegar. Hoy: 158 aprobadas, 7 fallidas, 20 sin ejecutar (AP-26, P0-4).
- [ ] La versión candidata está publicada en `origin` y su CI terminó en verde (hoy `d4a3cdc` no está publicado).
- [ ] P0-1 resuelto: la migración al cobro por hectárea no modifica superficies reales ni reinterpreta la tarifa (AP-01).
- [ ] La versión está integrada en `main` con `--no-ff` y tiene etiqueta (`git tag`).
- [ ] CI verde en `main` para esa etiqueta (la última ejecución en `main`, del 2026-11-11, falló en E2E).
- [ ] `npm audit --omit=dev --audit-level=high` sin avisos en `backend` y `frontend` (comprobado hoy: 0).

## 2. Configuración del servidor

- [ ] `backend/.env` copiado de `backend/.env.production.example`, con `chmod 600` y propietario `junta`.
- [ ] `NODE_ENV=production`.
- [ ] `JWT_SECRET` nuevo, aleatorio, de 48 bytes o más; nunca reutilizado de desarrollo.
- [ ] `DB_USER` propio (no `root`) y `DB_PASSWORD` larga y aleatoria.
- [ ] `HOST=127.0.0.1` y `TRUST_PROXY=1` detrás de Caddy/Nginx.
- [ ] `FRONTEND_URL=https://<dominio>`.
- [ ] `WHATSAPP_SERVICE_TOKEN` igual en `backend/.env` y `whatsapp-service/.env` (si se usa WhatsApp).
- [ ] `npm run prod:preparar` termina sin avisos de configuración.

## 3. Red y HTTPS

- [ ] DNS `A` de `@` y `www` hacia el servidor.
- [ ] Cortafuegos: solo 22, 80 y 443 abiertos (`ufw status`). 3000, 3100 y 3306 cerrados desde fuera.
- [ ] SSH solo con clave, sin `root` (`PasswordAuthentication no`, `PermitRootLogin no`); `fail2ban` activo.
- [ ] Caddy o Nginx con certificado válido; HTTP redirige a HTTPS; cabecera `Strict-Transport-Security`.
- [ ] `curl -I https://<dominio>` muestra `Content-Security-Policy`, `X-Content-Type-Options` y no muestra `X-Powered-By`.
- [ ] `/api-docs` responde 404 en producción.

## 4. Base de datos

- [ ] MySQL 8 escuchando solo en `127.0.0.1`.
- [ ] Respaldo previo a la actualización creado y verificado.
- [ ] Migraciones aplicadas (`npm run db:migrate` dice "La base de datos ya está al día").
- [ ] Sin datos de prueba: ninguna persona con la cédula de ejemplo `1800000001` (AP-16) y ningún lote con la nota "Superficie provisional de demostración" sin revisar (AP-01).
- [ ] Tarifas registradas (agua por hectárea, multas de asamblea y minga) y sectores creados.
- [ ] Al menos dos administradores activos.

## 5. Servicios y reinicio

- [ ] `junta-backend.service` habilitado (`systemctl is-enabled`) y reiniciándose solo tras `kill -9`.
- [ ] Servicio de WhatsApp con reinicio automático, si se usa (P2-3).
- [ ] Reinicio completo del servidor: el sistema vuelve solo y `/api/health` responde `{"status":"OK","database":"OK"}`.
- [ ] La auditoría registra la IP real del cliente, no `127.0.0.1`.

## 6. Respaldos y recuperación

- [ ] Respaldo diario programado (timer o cron) — P0-2.
- [ ] Copia diaria fuera del servidor, cifrada — P0-2.
- [ ] Restauración probada en una base temporal con conteos comparados; fecha de la última prueba: ____.
- [ ] Restauración de `uploads/` probada.
- [ ] Procedimiento de actualización y vuelta atrás ensayado — P0-3.

## 7. Monitoreo

- [ ] `scripts/vigilar.js` activo con `VIGILAR_WEBHOOK` y aviso recibido en una prueba.
- [ ] Monitor externo contra `https://<dominio>/api/health`.
- [ ] Aviso de espacio en disco — P1-2.
- [ ] Registro consultable: `journalctl -u junta-backend` muestra líneas JSON con `reqId`.

## 8. Operación

- [ ] Los administradores saben recuperar una cuenta (`POST /personas/:id/cuenta/restablecer-password`, desbloqueo) y el responsable técnico sabe usar `npm run db:reset-admin`.
- [ ] Contactos y procedimiento ante incidentes anotados (quién reinicia, quién restaura).
- [ ] Riesgo aceptado del servicio de WhatsApp registrado (AP-07).

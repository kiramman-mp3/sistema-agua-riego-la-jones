# Roadmap

Plan de trabajo vigente: corrección de los hallazgos de la auditoría de preparación para producción del 2026-11-12. El detalle de cada tarea está en [`auditoria/PLAN_IMPLEMENTACION.md`](auditoria/PLAN_IMPLEMENTACION.md) y los hallazgos en [`auditoria/HALLAZGOS.md`](auditoria/HALLAZGOS.md).

## Sprint 0 — Preparación

- [x] Publicar `develop` en `origin` para que la CI corra sobre la versión candidata.
- [x] Protección de `main` y `develop`: los cuatro trabajos de CI son obligatorios para integrar por pull request (los administradores pueden publicar directamente).
- [x] Crear este roadmap.

## Sprint 1 — Bloqueadores (P0)

- [x] 1.1 La migración `031` no inventa superficies en producción; `033` desactiva la tarifa de agua por lote; aviso de lotes con superficie provisional (AP-01).
- [ ] 1.2 Limpieza de los lotes de prueba del VPS (se hace en el despliegue, con confirmación).
- [ ] 1.3 E2E en verde (AP-26).
- [ ] 1.4 Bloqueo del migrador y `npm run actualizar` con vuelta atrás (AP-03).
- [ ] 1.5 Publicación `v1.1.0`.

## Sprint 2 — Alta prioridad (P1)

- [ ] 2.1 Tiempos límite de la base de datos y de `/api/health` (AP-04).
- [ ] 2.2 Vigilancia de disco, latencia y errores 5xx (AP-08).

## Sprint 3 — Prioridad media (P2)

- [ ] 3.1 Auditoría dentro de la transacción (AP-05).
- [ ] 3.2 Caducidad de intentos, límite por cuenta y purga (AP-06, AP-12).
- [ ] 3.3 Unidad `systemd` de WhatsApp y ADR del riesgo aceptado (AP-07, AP-19).
- [ ] 3.4 Subtipo de asamblea persistido (AP-27).

## Sprint 4 — Mejoras (P3)

- [ ] AP-09, AP-10, AP-13, AP-14, AP-15, AP-17, AP-18, AP-24, AP-25.

## Sprint 5 — Endurecimiento de sesión

- [ ] TOTP opcional para ADMIN (AP-06).
- [ ] Sesión en cookie `HttpOnly` (AP-11).

## Fuera de este roadmap

- Respaldos automáticos externos (AP-02): módulo 3.6 de la cotización de módulos pendientes.

## Seguimiento

| Sprint | Estado | Inicio | Fin | Notas |
|---|---|---|---|---|
| 0 | Terminado | 2026-11-13 | 2026-11-13 | La CI de `develop` en `c33ad9b` quedó como línea base: verde salvo E2E |
| 1 | En curso | 2026-11-13 | | |
| 2 | Pendiente | | | |
| 3 | Pendiente | | | |
| 4 | Pendiente | | | |
| 5 | Pendiente | | | |

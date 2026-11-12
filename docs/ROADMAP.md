# Roadmap

Plan de trabajo vigente: corrección de los hallazgos de la auditoría de preparación para producción del 2026-11-12. El detalle de cada tarea está en [`auditoria/PLAN_IMPLEMENTACION.md`](auditoria/PLAN_IMPLEMENTACION.md) y los hallazgos, con su estado, en [`auditoria/HALLAZGOS.md`](auditoria/HALLAZGOS.md).

## Sprint 0 — Preparación

- [x] Publicar `develop` en `origin` para que la CI corra sobre la versión candidata.
- [x] Protección de `main` y `develop`: los cuatro trabajos de CI son obligatorios para integrar por pull request (los administradores pueden publicar directamente).
- [x] Crear este roadmap.

## Sprint 1 — Bloqueadores (P0) · `v1.1.0`

- [x] 1.1 La migración `031` no inventa superficies en producción; `033` desactiva la tarifa de agua por lote; aviso de lotes con superficie provisional (AP-01).
- [ ] 1.2 Limpieza de los lotes de prueba del VPS (se hace en el despliegue, con confirmación).
- [x] 1.3 E2E en verde (AP-26).
- [x] 1.4 Bloqueo del migrador y `npm run actualizar` con vuelta atrás (AP-03).
- [x] 1.5 Publicación `v1.1.0`.

## Sprint 2 — Alta prioridad (P1) · `v1.2.0`

- [x] 2.1 Tiempos límite de la base de datos y de `/api/health` (AP-04).
- [x] 2.2 Vigilancia de disco, latencia y errores 5xx (AP-08).

## Sprint 3 — Prioridad media (P2) · `v1.2.0`

- [x] 3.1 Auditoría dentro de la transacción (AP-05).
- [x] 3.2 Caducidad de intentos, alerta de ataques distribuidos y purga (AP-06 parcial, AP-12).
- [x] 3.3 Unidad `systemd` de WhatsApp y ADR del riesgo aceptado (AP-07, AP-19).
- [x] 3.4 Subtipo de asamblea persistido (AP-27).

## Sprint 4 — Mejoras (P3) · `v1.2.0`

- [x] AP-09 Bloqueo del lote al editarlo (y conservar los campos omitidos en ediciones parciales).
- [x] AP-10 La cuota reabierta pasa al titular actual del lote.
- [x] AP-13 Privilegios de MySQL documentados.
- [x] AP-14 Dependencias menores actualizadas.
- [x] AP-15 Cobertura en CI y pruebas de eliminación de personas.
- [x] AP-17 Índices de la auditoría.
- [x] AP-18 Revocación de sesiones con la hora del servidor.
- [x] AP-24 Build sin avisos de CommonJS.
- [x] AP-25 Contraseñas con `scrypt` asíncrono.

## Sprint 5 — Endurecimiento de sesión · `v1.3.0`

- [ ] TOTP opcional para ADMIN (AP-06).
- [ ] Sesión en cookie `HttpOnly` (AP-11).

## Fuera de este roadmap

- Respaldos automáticos externos (AP-02): módulo 3.6 de la cotización de módulos pendientes.

## Seguimiento

| Sprint | Estado | Inicio | Fin | Notas |
|---|---|---|---|---|
| 0 | Terminado | 2026-11-13 | 2026-11-13 | La CI de `develop` en `c33ad9b` quedó como línea base: verde salvo E2E |
| 1 | Terminado (salvo 1.2) | 2026-11-13 | 2026-11-13 | `v1.1.0` sobre `4d6b694`. Los 7 fallos de E2E eran pruebas desactualizadas o encadenadas. La limpieza del VPS (1.2) se hace en el despliegue |
| 2 | Terminado | 2026-11-13 | 2026-11-13 | |
| 3 | Terminado | 2026-11-13 | 2026-11-13 | En AP-06 se dejó una alerta en la auditoría y retraso de respuestas en lugar de un aviso en el padrón |
| 4 | Terminado | 2026-11-13 | 2026-11-13 | Se encontraron y corrigieron dos errores reales: eliminar una persona fallaba siempre (tabla `asistencias_eventos` inexistente) y las ediciones parciales por API borraban campos opcionales |
| 5 | En curso | 2026-11-13 | | |

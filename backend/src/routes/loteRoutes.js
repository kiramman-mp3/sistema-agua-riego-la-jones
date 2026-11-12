const express = require('express');
const loteController = require('../controllers/loteController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @openapi
 * /lotes/sectores:
 *   get:
 *     tags: [Lotes y Sectores]
 *     summary: Catálogo público de sectores (sin datos personales)
 *   post:
 *     tags: [Lotes y Sectores]
 *     summary: Crear sector (ADMIN)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/sectores', loteController.getSectores);
router.post('/sectores', ...soloAdmin, loteController.createSector);
router.put('/sectores/:id', ...soloAdmin, loteController.updateSector);
router.delete('/sectores/:id', ...soloAdmin, loteController.deleteSector);

/**
 * @openapi
 * /lotes/sugerir-codigo:
 *   get:
 *     tags: [Lotes y Sectores]
 *     summary: Sugiere el siguiente código libre para un sector
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: sector_id, required: true, schema: { type: integer } }
 * /lotes:
 *   get:
 *     tags: [Lotes y Sectores]
 *     summary: Listar lotes. El administrador ve todos; un usuario solo los suyos.
 *     description: Con page devuelve una página (limit, máximo 100) y el total en pagination; sin page, la lista completa.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: sector_id, schema: { type: integer } }
 *       - { in: query, name: busqueda, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *   post:
 *     tags: [Lotes y Sectores]
 *     summary: Registrar lote y, opcionalmente, su titular
 *     security: [{ bearerAuth: [] }]
 * /lotes/{loteId}/vincular-persona:
 *   post:
 *     tags: [Lotes y Sectores]
 *     summary: Asignar o transferir la titularidad de un lote
 *     description: La deuda sigue al lote. Las cuotas anuales de agua PENDIENTES del lote (de cualquier año) pasan al nuevo titular; las pagadas quedan como historial de quien las pagó. La respuesta trae deudaTransferida.
 *     security: [{ bearerAuth: [] }]
 * /lotes/{loteId}/deuda-agua:
 *   get:
 *     tags: [Lotes y Sectores]
 *     summary: Cuotas anuales de agua pendientes de un lote, con su total (ADMIN). Es lo que pasaría al nuevo titular al transferirlo.
 *     security: [{ bearerAuth: [] }]
 */
router.get('/sugerir-codigo', ...soloAdmin, loteController.sugerirCodigo);
router.get('/', verificarToken, loteController.getLotes);
router.post('/', ...soloAdmin, loteController.createLote);
router.put('/:id', ...soloAdmin, loteController.updateLote);
router.get('/:loteId/deuda-agua', ...soloAdmin, loteController.getDeudaAguaLote);
router.post('/:loteId/vincular-persona', ...soloAdmin, loteController.linkPersonaLote);

module.exports = router;

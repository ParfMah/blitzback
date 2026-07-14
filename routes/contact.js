/**
 * BLITZ LEIHEN — Routes /api/contact
 *
 * POST /api/contact → envoyer un message via le formulaire de contact (public)
 *
 * Distinct de /api/demandes (demande de prêt structurée avec BaFin/SCHUFA).
 * Rate limited à 10/heure par IP (défini dans server.js), plus permissif
 * que les demandes de prêt car sans impact BaFin/SCHUFA.
 */

const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/contactController');
const { validationContact } = require('../middleware/validate');

/**
 * POST /api/contact
 * Envoie un message libre depuis kontakt.html.
 */
router.post('/', validationContact, ctrl.envoyerMessageContact);

module.exports = router;

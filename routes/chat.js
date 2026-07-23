/**
 * BLITZ LEIHEN — Routes /api/chat
 *
 * Live-Chat entre les visiteurs du site public et les conseillers (admin).
 * Voir controllers/chatController.js pour le détail de chaque route.
 */

const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');

const ctrl = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

/* Petite validation générique du texte d'un message */
const validerTexte = [
  body('texte')
    .trim()
    .notEmpty().withMessage('Nachricht darf nicht leer sein')
    .isLength({ max: 4000 }).withMessage('Nachricht zu lang (max. 4000 Zeichen)'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }
    next();
  },
];

/* ----------------------------------------------------------
   ROUTES PUBLIQUES — VISITEUR (pas d'authentification)
---------------------------------------------------------- */
router.post('/conversations', ctrl.demarrerConversation);
router.get('/conversations/:visiteurId', ctrl.obtenirConversationVisiteur);
router.post('/conversations/:visiteurId/message', validerTexte, ctrl.envoyerMessageVisiteur);

/* ----------------------------------------------------------
   ROUTES ADMIN (JWT requis)
---------------------------------------------------------- */
router.get('/admin/conversations', protect, ctrl.listerConversations);
router.get('/admin/non-lus', protect, ctrl.compterNonLus);
router.get('/admin/conversations/:id', protect, ctrl.obtenirConversationAdmin);
router.post('/admin/conversations/:id/message', protect, validerTexte, ctrl.envoyerMessageAdmin);
router.put('/admin/conversations/:id/statut', protect, ctrl.changerStatut);
router.put('/admin/conversations/:id/lu', protect, ctrl.marquerLu);

/* 👉 AJOUTER CETTE LIGNE ICI : */
router.put('/admin/conversations/:id/prendre-en-charge', protect, ctrl.prendreEnChargeConversation);

module.exports = router;

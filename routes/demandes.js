/**
 * BLITZ LEIHEN — Routes /api/demandes
 *
 * POST   /api/demandes              → soumettre une demande (public)
 * GET    /api/demandes              → lister toutes (admin)
 * GET    /api/demandes/:id          → détail complet (admin)
 * PUT    /api/demandes/:id/statut   → changer le statut (admin)
 * PUT    /api/demandes/:id/assigner → assigner à un conseiller (admin)
 * POST   /api/demandes/:id/note     → ajouter une note interne (admin)
 * DELETE /api/demandes/:id          → supprimer définitivement (superadmin)
 */

const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/demandeController');
const { protect, autoriser }           = require('../middleware/auth');
const { validationDemande, validationStatut, validationMongoId } = require('../middleware/validate');

/* ----------------------------------------------------------
   ROUTES PUBLIQUES — Accessible sans authentification
---------------------------------------------------------- */

/**
 * POST /api/demandes
 * Soumet une nouvelle demande de crédit depuis le formulaire frontend.
 * Déclenche l'envoi d'emails et SMS automatiquement.
 * Rate limited à 5/heure par IP (défini dans server.js).
 */
router.post('/', validationDemande, ctrl.creerDemande);

/**
 * POST /api/demandes/abandon
 * Enregistre un abandon de formulaire et alerte le conseiller.
 * PUBLIC : pas de token requis (le visiteur n'est pas connecté).
 * Corps : données partielles + email + etape + localisation.
 * Doit être déclaré AVANT /:id pour ne pas être capturé par
 * la route de détail (Express interprèterait "abandon" comme un ID).
 */
router.post('/abandon', ctrl.signalerAbandon);

/* ----------------------------------------------------------
   ROUTES ADMIN — Nécessitent un token JWT valide
   Toutes les routes ci-dessous passent par le middleware protect
---------------------------------------------------------- */

/**
 * GET /api/demandes
 * Liste paginée avec filtres (statut, kreditart, search, dates, sort).
 * Query params : page, limit, statut, kreditart, search, depuis, jusqu, sort
 */
router.get('/', protect, ctrl.listerDemandes);

/**
 * GET /api/demandes/:id
 * Détail complet d'une demande + historique statuts + messages.
 */
router.get('/:id', protect, validationMongoId, ctrl.obtenirDemande);

/**
 * PUT /api/demandes/:id/statut
 * Modifie le statut (Neu → Analyse → Akzeptiert/Abgelehnt).
 * Déclenche l'email et le SMS de notification au client.
 */
router.put('/:id/statut', protect, validationStatut, ctrl.modifierStatut);

/**
 * PUT /api/demandes/:id/assigner
 * Assigne la demande à un conseiller.
 * Corps : { adminId } (optionnel, se prend par défaut)
 */
router.put('/:id/assigner', protect, validationMongoId, ctrl.assignerDemande);

/**
 * POST /api/demandes/:id/note
 * Ajoute une note interne visible uniquement par les admins.
 */
router.post('/:id/note', protect, validationMongoId, ctrl.ajouterNote);

/**
 * DELETE /api/demandes/:id
 * Supprime définitivement une demande et tous ses messages.
 * Réservé au superadmin.
 */
router.delete('/:id', protect, autoriser(['superadmin']), validationMongoId, ctrl.supprimerDemande);

module.exports = router;

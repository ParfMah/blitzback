/**
 * BLITZ LEIHEN — Routes /api/admin
 *
 * GET  /api/admin/stats              → statistiques dashboard
 * GET  /api/admin/stats/periode      → stats sur période personnalisée
 * GET  /api/admin/admins             → liste des admins (superadmin)
 * POST /api/admin/admins             → créer un admin (superadmin)
 * PUT  /api/admin/admins/:id         → modifier un admin (superadmin)
 * PUT  /api/admin/mot-de-passe       → changer son propre MDP
 */

const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/adminController');
const { protect, autoriser } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

/* Toutes les routes admin nécessitent une authentification */
router.use(protect);

/* ----------------------------------------------------------
   STATISTIQUES DASHBOARD
---------------------------------------------------------- */

/**
 * GET /api/admin/stats
 * Retourne toutes les métriques en temps réel :
 * total demandes, par statut, montants, activité 7 jours, etc.
 */
router.get('/stats', ctrl.obtenirStats);

/**
 * GET /api/admin/stats/periode?depuis=2025-01-01&jusqu=2025-01-31
 * Statistiques sur une période personnalisée (graphiques).
 */
router.get('/stats/periode', ctrl.obtenirStatsPeriode);

/* ----------------------------------------------------------
   GESTION DES COMPTES ADMINISTRATEURS
   Réservé au rôle superadmin
---------------------------------------------------------- */

/**
 * GET /api/admin/admins
 * Liste tous les comptes administrateurs (sans les MDP).
 */
router.get('/admins',
  autoriser(['superadmin']),
  ctrl.listerAdmins
);

/**
 * POST /api/admin/admins
 * Crée un nouveau compte admin.
 * Corps : { name, email, password, role }
 */
router.post('/admins',
  autoriser(['superadmin']),
  [
    body('name').trim().notEmpty().withMessage('Name ist erforderlich'),
    body('email').isEmail().withMessage('Ungültige E-Mail').normalizeEmail({ gmail_remove_dots: false }),
    body('password').isLength({ min: 8 }).withMessage('Passwort: min. 8 Zeichen'),
    body('role').optional().isIn(['admin', 'superadmin', 'conseiller']).withMessage('Ungültige Rolle'),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }
      next();
    },
  ],
  ctrl.creerAdmin
);

/**
 * PUT /api/admin/admins/:id
 * Modifie un compte admin existant.
 * Corps : { name?, email?, role?, actif? }
 */
router.put('/admins/:id',
  autoriser(['superadmin']),
  ctrl.modifierAdmin
);

/* ----------------------------------------------------------
   GESTION DU PROPRE COMPTE
   Accessible à tous les admins connectés
---------------------------------------------------------- */

/**
 * PUT /api/admin/mot-de-passe
 * L'admin change son propre mot de passe.
 * Corps : { ancienPassword, nouveauPassword }
 */
router.put('/mot-de-passe', ctrl.changerMotDePasse);

module.exports = router;

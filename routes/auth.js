/**
 * BLITZ LEIHEN — Routes /api/auth
 *
 * POST /api/auth/login    → connexion admin + génération JWT
 * POST /api/auth/logout   → déconnexion (invalide côté client)
 * GET  /api/auth/me       → profil de l'admin connecté
 * POST /api/auth/refresh  → renouvellement du token JWT
 */

const express = require('express');
const router  = express.Router();

const ctrl  = require('../controllers/authController');
const { protect }          = require('../middleware/auth');
const { validationLogin }  = require('../middleware/validate');

/**
 * POST /api/auth/login
 * Corps : { username: "email", password: "..." }
 * Réponse : { token, expiresAt, user }
 * Rate limited à 10 tentatives/15min par IP (server.js).
 */
router.post('/login', validationLogin, ctrl.login);

/**
 * POST /api/auth/logout
 * Informe le serveur de la déconnexion.
 * Le vrai travail est fait côté client (suppression du token).
 */
router.post('/logout', ctrl.logout);

/**
 * GET /api/auth/me
 * Retourne le profil de l'admin authentifié.
 * Nécessite un token JWT valide.
 */
router.get('/me', protect, ctrl.moi);

/**
 * POST /api/auth/refresh
 * Renouvelle le token avant son expiration.
 * Nécessite un token encore valide.
 */
router.post('/refresh', protect, ctrl.refresh);

module.exports = router;

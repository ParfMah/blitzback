/**
 * BLITZ LEIHEN — Contrôleur d'authentification Admin
 *
 * Gère :
 *   POST /api/auth/login   → connexion + génération JWT
 *   POST /api/auth/logout  → déconnexion (côté client)
 *   GET  /api/auth/me      → profil de l'admin connecté
 *   POST /api/auth/refresh → renouvellement du token
 */

const jwt   = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { createError } = require('../middleware/errorHandler');

/* ----------------------------------------------------------
   UTILITAIRE : Génération du token JWT
   Payload : id de l'admin + rôle
   Durée   : configurée via JWT_EXPIRES_IN (.env)
---------------------------------------------------------- */
const genererToken = (admin) => {
  return jwt.sign(
    { id: admin._id, role: admin.role, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

/* ----------------------------------------------------------
   POST /api/auth/login
   Corps : { username: string, password: string }
   Réponse : { success, token, user }
---------------------------------------------------------- */
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // 1. Trouver l'admin (inclure le password pour comparaison)
    const admin = await Admin.findOne({ email: username.toLowerCase().trim() })
                             .select('+password +loginTentativesEchouees +compteVerrouille +verrouillageFin');

    if (!admin) {
      // Ne pas indiquer si l'email existe ou non (sécurité)
      return res.status(401).json({
        success: false,
        message: 'E-Mail oder Passwort ist falsch',
      });
    }

    // 2. Vérifier si le compte est actif
    if (!admin.actif) {
      return res.status(403).json({
        success: false,
        message: 'Ihr Konto wurde deaktiviert. Kontaktieren Sie den Support.',
      });
    }

    // 3. Vérifier le verrouillage
    if (await admin.estVerrouille()) {
      const restant = Math.ceil((admin.verrouillageFin - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Konto gesperrt nach zu vielen Fehlversuchen. Bitte warten Sie ${restant} Minuten.`,
      });
    }

    // 4. Vérifier le mot de passe
    const motDePasseValide = await admin.verifierMotDePasse(password);

    if (!motDePasseValide) {
      // Enregistrer l'échec (peut verrouiller le compte)
      await admin.enregistrerEchec();

      const tentativesRestantes = Math.max(0, 5 - admin.loginTentativesEchouees);
      return res.status(401).json({
        success: false,
        message: `E-Mail oder Passwort ist falsch. ${tentativesRestantes > 0 ? `Noch ${tentativesRestantes} Versuch(e) verbleibend.` : 'Konto wird gesperrt.'}`,
      });
    }

    // 5. Connexion réussie → réinitialiser les tentatives
    await admin.reinitialiserTentatives(ip);

    // 6. Générer le token JWT
    const token = genererToken(admin);

    // 7. Calculer l'expiration du token (pour le frontend)
    const decoded   = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    console.log(`✅ Admin connecté : ${admin.email} | IP : ${ip}`);

    res.status(200).json({
      success: true,
      message: 'Erfolgreich angemeldet',
      token,
      expiresAt,
      user: {
        id:    admin._id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
        derniereConnexion: admin.derniereConnexion,
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   POST /api/auth/logout
   Le token JWT est invalidé côté client (suppression du sessionStorage).
   Côté serveur : retourne juste un succès.
   Pour une vraie invalidation serveur → implémenter une blacklist Redis.
---------------------------------------------------------- */
exports.logout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Erfolgreich abgemeldet. Bitte löschen Sie Ihren Token.',
  });
};

/* ----------------------------------------------------------
   GET /api/auth/me
   Retourne le profil de l'admin actuellement connecté.
   Nécessite le middleware protect.
---------------------------------------------------------- */
exports.moi = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin._id);

    if (!admin) {
      return next(createError(404, 'Administrator nicht gefunden'));
    }

    res.status(200).json({
      success: true,
      user: {
        id:                admin._id,
        name:              admin.name,
        email:             admin.email,
        role:              admin.role,
        actif:             admin.actif,
        derniereConnexion: admin.derniereConnexion,
        createdAt:         admin.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   POST /api/auth/refresh
   Renouvelle un token encore valide avant expiration.
   Utile pour garder la session active sans re-connexion.
---------------------------------------------------------- */
exports.refresh = async (req, res, next) => {
  try {
    const admin   = req.admin; // Injecté par le middleware protect
    const token   = genererToken(admin);
    const decoded = jwt.decode(token);

    res.status(200).json({
      success:   true,
      token,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

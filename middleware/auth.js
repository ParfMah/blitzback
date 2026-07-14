/**
 * BLITZ LEIHEN — Middleware d'authentification JWT
 *
 * Protège les routes admin en vérifiant le token JWT.
 * Utilisation : router.get('/route', protect, handler)
 * Rôles : protect() + autoriser(['superadmin', 'admin'])
 */

const jwt   = require('jsonwebtoken');
const Admin = require('../models/Admin');

/* ----------------------------------------------------------
   MIDDLEWARE PRINCIPAL : protect
   Vérifie la présence et la validité du token JWT.
   Attache l'objet admin à req.admin pour les contrôleurs.
---------------------------------------------------------- */
const protect = async (req, res, next) => {
  try {
    // 1. Extraire le token du header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Nicht autorisiert — kein Token vorhanden',
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Vérifier et décoder le token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Sitzung abgelaufen — bitte erneut anmelden'
        : 'Ungültiges Token — bitte erneut anmelden';

      return res.status(401).json({ success: false, message });
    }

    // 3. Vérifier que l'admin existe toujours en base
    const admin = await Admin.findById(decoded.id).select('-password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Administrator nicht gefunden',
      });
    }

    // 4. Vérifier que le compte est actif
    if (!admin.actif) {
      return res.status(403).json({
        success: false,
        message: 'Ihr Konto wurde deaktiviert. Kontaktieren Sie den Support.',
      });
    }

    // 5. Vérifier le verrouillage du compte
    if (await admin.estVerrouille()) {
      const restant = Math.ceil((admin.verrouillageFin - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Konto gesperrt. Bitte warten Sie ${restant} Minuten.`,
      });
    }

    // Tout OK → attache l'admin à la requête
    req.admin = admin;
    next();

  } catch (error) {
    console.error('Erreur middleware auth :', error);
    res.status(500).json({
      success: false,
      message: 'Interner Serverfehler bei der Authentifizierung',
    });
  }
};

/* ----------------------------------------------------------
   MIDDLEWARE DE RÔLE : autoriser
   Restreint l'accès selon le rôle de l'admin.
   Exemple : autoriser(['superadmin']) pour les suppressions
---------------------------------------------------------- */
const autoriser = (roles = []) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Nicht authentifiziert',
      });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Zugriff verweigert. Erforderliche Rolle: ${roles.join(' oder ')}`,
      });
    }

    next();
  };
};

/* ----------------------------------------------------------
   MIDDLEWARE OPTIONNEL : identifierAdmin
   Attache l'admin si le token est présent, sans bloquer
   si absent. Utile pour les routes semi-publiques.
---------------------------------------------------------- */
const identifierAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin   = await Admin.findById(decoded.id).select('-password');
    if (admin && admin.actif) req.admin = admin;
  } catch {
    // Silencieux — le token peut être absent ou expiré
  }
  next();
};

module.exports = { protect, autoriser, identifierAdmin };

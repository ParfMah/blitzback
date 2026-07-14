/**
 * BLITZ LEIHEN — Contrôleur Admin (Dashboard & Gestion)
 *
 * Gère :
 *   GET  /api/admin/stats          → statistiques générales du dashboard
 *   GET  /api/admin/stats/periode  → évolution sur une période
 *   GET  /api/admin/admins         → liste des administrateurs (superadmin)
 *   POST /api/admin/admins         → créer un nouvel admin (superadmin)
 *   PUT  /api/admin/admins/:id     → modifier un admin (superadmin)
 *   PUT  /api/admin/mot-de-passe   → changer son propre MDP
 */

const Admin   = require('../models/Admin');
const Demande = require('../models/Demande');
const Message = require('../models/Message');
const bcrypt  = require('bcryptjs');
const { createError } = require('../middleware/errorHandler');

/* ----------------------------------------------------------
   GET /api/admin/stats
   Retourne toutes les statistiques pour le dashboard admin.
   Calculées en temps réel depuis MongoDB.
---------------------------------------------------------- */
exports.obtenirStats = async (req, res, next) => {
  try {
    // Toutes les requêtes en parallèle pour la performance
    const [
      total,
      parStatut,
      parKreditart,
      montantTotal,
      demandesRecentes,
      demandesAujourdhui,
      demandes7Jours,
    ] = await Promise.all([

      // Nombre total de demandes
      Demande.countDocuments(),

      // Répartition par statut
      Demande.aggregate([
        { $group: { _id: '$statut', count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
      ]),

      // Répartition par type de prêt
      Demande.aggregate([
        { $group: { _id: '$kreditart', count: { $sum: 1 }, montantMoyen: { $avg: '$kreditbetrag' } } },
        { $sort:  { count: -1 } },
      ]),

      // Montant total des crédits demandés
      Demande.aggregate([
        { $group: { _id: null, total: { $sum: '$kreditbetrag' }, moyen: { $avg: '$kreditbetrag' } } },
      ]),

      // 5 dernières demandes (pour la liste rapide du dashboard)
      Demande.find()
        .select('referenceNumber vorname nachname kreditart kreditbetrag statut createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // Demandes reçues aujourd'hui
      Demande.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),

      // Demandes des 7 derniers jours (pour le graphique)
      Demande.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count:  { $sum: 1 },
            montant: { $sum: '$kreditbetrag' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Formater par statut en objet clé-valeur
    const statutMap = { Neu: 0, Analyse: 0, Akzeptiert: 0, Abgelehnt: 0 };
    parStatut.forEach(s => { statutMap[s._id] = s.count; });

    // Montants globaux
    const montants = montantTotal[0] || { total: 0, moyen: 0 };

    res.status(200).json({
      success: true,
      data: {
        // Chiffres clés
        total,
        parStatut:   statutMap,
        aujourdhui:  demandesAujourdhui,
        tauxAcceptation: total > 0
          ? Math.round((statutMap.Akzeptiert / total) * 100)
          : 0,

        // Montants
        montants: {
          total:   Math.round(montants.total),
          moyen:   Math.round(montants.moyen),
        },

        // Répartition types de prêts
        parKreditart: parKreditart.map(k => ({
          type:         k._id,
          count:        k.count,
          montantMoyen: Math.round(k.montantMoyen),
        })),

        // Activité récente
        demandesRecentes,
        activite7Jours: demandes7Jours.map(j => ({
          date:    j._id,
          count:   j.count,
          montant: Math.round(j.montant),
        })),
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   GET /api/admin/stats/periode
   Statistiques sur une période personnalisée.
   Query : depuis (date), jusqu (date)
---------------------------------------------------------- */
exports.obtenirStatsPeriode = async (req, res, next) => {
  try {
    const depuis  = new Date(req.query.depuis || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const jusquA  = new Date(req.query.jusqu  || new Date());

    const activite = await Demande.aggregate([
      { $match: { createdAt: { $gte: depuis, $lte: jusquA } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count:   { $sum: 1 },
          montant: { $sum: '$kreditbetrag' },
          acceptes: {
            $sum: { $cond: [{ $eq: ['$statut', 'Akzeptiert'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        periode: { depuis: depuis.toISOString(), jusqu: jusquA.toISOString() },
        activite,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   GET /api/admin/admins — SUPERADMIN
   Liste tous les comptes administrateurs.
---------------------------------------------------------- */
exports.listerAdmins = async (req, res, next) => {
  try {
    const admins = await Admin.find()
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: { admins, total: admins.length },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   POST /api/admin/admins — SUPERADMIN
   Crée un nouveau compte administrateur.
   Corps : { name, email, password, role }
---------------------------------------------------------- */
exports.creerAdmin = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    // Vérifier si l'email est déjà utilisé
    const existant = await Admin.findOne({ email: email.toLowerCase() });
    if (existant) {
      return res.status(409).json({
        success: false,
        message: 'Diese E-Mail-Adresse ist bereits vergeben',
      });
    }

    const admin = await Admin.create({
      name,
      email: email.toLowerCase(),
      password,
      role:  role || 'conseiller',
      actif: true,
    });

    console.log(`👤 Nouvel admin créé : ${admin.email} (${admin.role}) par ${req.admin.email}`);

    res.status(201).json({
      success: true,
      message: 'Administrator erfolgreich erstellt',
      data: {
        admin: {
          id:    admin._id,
          name:  admin.name,
          email: admin.email,
          role:  admin.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   PUT /api/admin/admins/:id — SUPERADMIN
   Modifie un compte admin (nom, email, rôle, actif).
   Corps : { name?, email?, role?, actif? }
---------------------------------------------------------- */
exports.modifierAdmin = async (req, res, next) => {
  try {
    const { name, email, role, actif } = req.body;

    // Empêcher de se désactiver soi-même
    if (req.params.id === req.admin._id.toString() && actif === false) {
      return res.status(400).json({
        success: false,
        message: 'Sie können Ihr eigenes Konto nicht deaktivieren',
      });
    }

    const updates = {};
    if (name  !== undefined) updates.name  = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (role  !== undefined) updates.role  = role;
    if (actif !== undefined) updates.actif = actif;

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!admin) return next(createError(404, 'Administrator nicht gefunden'));

    res.status(200).json({
      success: true,
      message: 'Administrator aktualisiert',
      data: { admin },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   PUT /api/admin/mot-de-passe
   Permet à l'admin connecté de changer son propre MDP.
   Corps : { ancienPassword, nouveauPassword }
---------------------------------------------------------- */
exports.changerMotDePasse = async (req, res, next) => {
  try {
    const { ancienPassword, nouveauPassword } = req.body;

    if (!ancienPassword || !nouveauPassword) {
      return res.status(400).json({
        success: false,
        message: 'Altes und neues Passwort sind erforderlich',
      });
    }

    if (nouveauPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Neues Passwort muss mindestens 8 Zeichen haben',
      });
    }

    // Récupérer l'admin avec le MDP
    const admin = await Admin.findById(req.admin._id).select('+password');

    const valide = await admin.verifierMotDePasse(ancienPassword);
    if (!valide) {
      return res.status(401).json({
        success: false,
        message: 'Das alte Passwort ist falsch',
      });
    }

    admin.password = nouveauPassword;
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Passwort erfolgreich geändert. Bitte melden Sie sich erneut an.',
    });
  } catch (error) {
    next(error);
  }
};

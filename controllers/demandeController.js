/**
 * BLITZ LEIHEN — Contrôleur Demandes de prêt
 *
 * Gère toutes les opérations sur les demandes :
 *   POST   /api/demandes              → soumettre une demande (public)
 *   GET    /api/demandes              → lister toutes les demandes (admin)
 *   GET    /api/demandes/:id          → détail d'une demande (admin)
 *   PUT    /api/demandes/:id/statut   → modifier le statut (admin)
 *   GET    /api/demandes/:id/messages → historique messages (admin)
 *   DELETE /api/demandes/:id          → supprimer (superadmin)
 */

const Demande = require('../models/Demande');
const Message = require('../models/Message');
const { createError } = require('../middleware/errorHandler');
const emailService    = require('../services/emailService');
const smsService      = require('../services/smsService');

/* ----------------------------------------------------------
   POST /api/demandes — PUBLIC
   Soumet une nouvelle demande de crédit.
   Envoie les emails et SMS automatiquement.
---------------------------------------------------------- */
exports.creerDemande = async (req, res, next) => {
  try {
    // 1. Préparer les données avec les infos réseau
    const donneesDemo = {
      ...req.body,
      ipAdresse: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      // Normaliser les booléens de consentement
      datenschutz:       req.body.datenschutz === true || req.body.datenschutz === 'true',
      agb:               req.body.agb === true || req.body.agb === 'true',
      schufa_zustimmung: req.body.schufa_zustimmung === true || req.body.schufa_zustimmung === 'true',
      // Localisation géographique approximative (collectée côté client via API IP)
      visiteurVille:                  req.body.visiteurVille || '',
      visiteurRegion:                 req.body.visiteurRegion || '',
      visiteurPays:                   req.body.visiteurPays || '',
      visiteurLocalisationAffichage:  req.body.visiteurLocalisationAffichage || '',
      // Dettes existantes : normalisées en nombre, 0 par défaut si vide/absent
      bestehendeVerbindlichkeiten: (req.body.bestehendeVerbindlichkeiten !== '' && req.body.bestehendeVerbindlichkeiten != null)
        ? Number(req.body.bestehendeVerbindlichkeiten)
        : 0,
    };

    // 2. Créer la demande en base (le hook pre-save génère la référence)
    const demande = await Demande.create(donneesDemo);

    console.log(`📋 Nouvelle demande : ${demande.referenceNumber} | ${demande.kreditart} ${demande.kreditbetrag}€ | ${demande.email}`);

    // 3. Envois asynchrones (emails + SMS) — non bloquants
    //    On n'attend pas la fin pour répondre au client
    setImmediate(async () => {
      try {
        // Email de confirmation au client
        const emailClient = await emailService.emailConfirmationClient(demande);
        if (emailClient.success) {
          await Demande.findByIdAndUpdate(demande._id, { emailClientEnvoye: true });
        }

        // Email de notification au conseiller
        const emailConseiller = await emailService.emailNotificationConseiller(demande);
        if (emailConseiller.success) {
          await Demande.findByIdAndUpdate(demande._id, { emailConseillerEnvoye: true });
        }

        // SMS de confirmation (si le client a accepté)
        if (demande.sms_verification === 'ja') {
          await smsService.smsConfirmationDemande(demande);
        }
      } catch (emailErr) {
        // Les erreurs d'email ne doivent pas affecter la réponse client
        console.error('Erreur envoi email/SMS (non bloquant) :', emailErr.message);
      }
    });

    // 4. Répondre immédiatement au client
    res.status(201).json({
      success: true,
      message: 'Ihr Kreditantrag wurde erfolgreich eingereicht. Sie erhalten in Kürze eine Bestätigungs-E-Mail.',
      referenceNumber: demande.referenceNumber,
      demande: {
        id:              demande._id,
        referenceNumber: demande.referenceNumber,
        kreditart:       demande.kreditart,
        kreditbetrag:    demande.kreditbetrag,
        laufzeit:        demande.laufzeit,
        statut:          demande.statut,
        createdAt:       demande.createdAt,
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   GET /api/demandes — ADMIN PROTÉGÉ
   Retourne la liste paginée des demandes avec filtres.
   Query params : page, limit, statut, kreditart, search, sort
---------------------------------------------------------- */
exports.listerDemandes = async (req, res, next) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(50, parseInt(req.query.limit) || 10);
    const skip    = (page - 1) * limit;

    // Construction du filtre MongoDB
    const filtre = {};

    if (req.query.statut && ['Neu', 'Analyse', 'Akzeptiert', 'Abgelehnt'].includes(req.query.statut)) {
      filtre.statut = req.query.statut;
    }

    if (req.query.kreditart) {
      filtre.kreditart = req.query.kreditart;
    }

    // Recherche textuelle (nom, email, référence)
    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      filtre.$or = [
        { vorname:         regex },
        { nachname:        regex },
        { email:           regex },
        { referenceNumber: regex },
      ];
    }

    // Filtre par date
    if (req.query.depuis) {
      filtre.createdAt = { ...filtre.createdAt, $gte: new Date(req.query.depuis) };
    }
    if (req.query.jusqu) {
      filtre.createdAt = { ...filtre.createdAt, $lte: new Date(req.query.jusqu) };
    }

    // Tri (par défaut : plus récent en premier)
    const sortOptions = {
      'recent':  { createdAt: -1 },
      'ancien':  { createdAt:  1 },
      'montant': { kreditbetrag: -1 },
    };
    const sort = sortOptions[req.query.sort] || { createdAt: -1 };

    // Exécution des requêtes en parallèle
    const [demandes, total] = await Promise.all([
      Demande.find(filtre)
        .select('-historiqueStatuts -userAgent') // Champs lourds exclus de la liste
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Demande.countDocuments(filtre),
    ]);

    res.status(200).json({
      success: true,
      data: {
        demandes,
        pagination: {
          total,
          page,
          limit,
          pages:     Math.ceil(total / limit),
          hasNext:   page < Math.ceil(total / limit),
          hasPrev:   page > 1,
        },
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   GET /api/demandes/:id — ADMIN PROTÉGÉ
   Retourne le détail complet d'une demande.
   Inclut l'historique des statuts et les messages.
---------------------------------------------------------- */
exports.obtenirDemande = async (req, res, next) => {
  try {
    const demande = await Demande.findById(req.params.id)
      .populate('assigneA', 'name email')
      .populate('historiqueStatuts.modifiePar', 'name email');

    if (!demande) {
      return next(createError(404, `Antrag nicht gefunden (ID: ${req.params.id})`));
    }

    // Récupérer les messages associés
    const messages = await Message.find({ demande: demande._id })
      .populate('auteur', 'name email')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        demande,
        messages,
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   PUT /api/demandes/:id/statut — ADMIN PROTÉGÉ
   Met à jour le statut d'une demande.
   Envoie automatiquement un email + SMS au client.
   Corps : { statut, commentaire }
---------------------------------------------------------- */
exports.modifierStatut = async (req, res, next) => {
  try {
    const { statut, commentaire } = req.body;

    const demande = await Demande.findById(req.params.id);

    if (!demande) {
      return next(createError(404, 'Antrag nicht gefunden'));
    }

    const ancienStatut = demande.statut;

    // Pas de changement → répondre quand même avec succès
    if (ancienStatut === statut) {
      return res.status(200).json({
        success: true,
        message: 'Status ist bereits aktuell — keine Änderung vorgenommen',
        data: { demande },
      });
    }

    // Mise à jour du statut avec tracking de l'admin
    demande._modifiePar       = req.admin._id;
    demande._commentaireStatut = commentaire || '';
    demande.statut             = statut;

    await demande.save();

    console.log(`📊 Statut modifié : ${demande.referenceNumber} | ${ancienStatut} → ${statut} | par ${req.admin.email}`);

    // Envois asynchrones
    setImmediate(async () => {
      try {
        await emailService.emailChangementStatut(demande);
        if (demande.sms_verification === 'ja') {
          await smsService.smsChangementStatut(demande);
        }
      } catch (err) {
        console.error('Erreur envoi notification statut :', err.message);
      }
    });

    res.status(200).json({
      success: true,
      message: `Status erfolgreich geändert: ${ancienStatut} → ${statut}`,
      data: {
        demande: {
          _id:             demande._id,
          referenceNumber: demande.referenceNumber,
          statut:          demande.statut,
          updatedAt:       demande.updatedAt,
        },
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   PUT /api/demandes/:id/assigner — ADMIN PROTÉGÉ
   Assigne une demande à un conseiller spécifique.
   Corps : { adminId }
---------------------------------------------------------- */
exports.assignerDemande = async (req, res, next) => {
  try {
    const demande = await Demande.findByIdAndUpdate(
      req.params.id,
      { assigneA: req.body.adminId || req.admin._id },
      { new: true }
    ).populate('assigneA', 'name email');

    if (!demande) {
      return next(createError(404, 'Antrag nicht gefunden'));
    }

    res.status(200).json({
      success: true,
      message: 'Antrag erfolgreich zugewiesen',
      data: { demande },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   POST /api/demandes/:id/note — ADMIN PROTÉGÉ
   Ajoute une note interne à une demande.
   Corps : { texte }
---------------------------------------------------------- */
exports.ajouterNote = async (req, res, next) => {
  try {
    const { texte } = req.body;

    if (!texte?.trim()) {
      return res.status(400).json({ success: false, message: 'Notiztext ist erforderlich' });
    }

    const demande = await Demande.findById(req.params.id);
    if (!demande) return next(createError(404, 'Antrag nicht gefunden'));

    // Mettre à jour la note interne sur la demande
    demande.noteInterne = texte.trim();
    await demande.save();

    // Créer un message de type note_interne
    const message = await Message.create({
      demande:   demande._id,
      type:      'note_interne',
      corps:     texte.trim(),
      auteur:    req.admin._id,
      statut:    'envoye',
      dateEnvoi: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Notiz erfolgreich hinzugefügt',
      data: { message },
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   DELETE /api/demandes/:id — SUPERADMIN SEULEMENT
   Supprime définitivement une demande et ses messages.
---------------------------------------------------------- */
exports.supprimerDemande = async (req, res, next) => {
  try {
    const demande = await Demande.findById(req.params.id);

    if (!demande) {
      return next(createError(404, 'Antrag nicht gefunden'));
    }

    // Supprimer les messages associés
    await Message.deleteMany({ demande: demande._id });

    // Supprimer la demande
    await demande.deleteOne();

    console.log(`🗑️  Demande supprimée : ${demande.referenceNumber} | par ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `Antrag ${demande.referenceNumber} wurde endgültig gelöscht`,
    });

  } catch (error) {
    next(error);
  }
};

/* ----------------------------------------------------------
   POST /api/demandes/abandon — PUBLIC
   Enregistre un abandon de formulaire.
   Appelé par le frontend quand un visiteur quitte la page
   après avoir au moins saisi son adresse email (étape 1).
   Envoie un email d'alerte au conseiller avec les données
   déjà renseignées et la localisation du visiteur.

   Corps :
     - (tous les champs partiels déjà remplis par le visiteur)
     - etape       : numéro de l'étape abandonnée (1, 2 ou 3)
     - visiteurLocalisationAffichage : ex. "Berlin, Germany"
     - visiteurVille, visiteurRegion, visiteurPays
---------------------------------------------------------- */
exports.signalerAbandon = async (req, res, next) => {
  try {
    const { email, etape } = req.body;

    // Sans email, impossible de recontacter le visiteur → on ignore
    if (!email || !email.includes('@')) {
      return res.status(200).json({ success: true, message: 'Email manquant — abandon ignoré' });
    }

    const stepLabels = {
      1: 'Schritt 1 von 3 (Persönliche Daten)',
      2: 'Schritt 2 von 3 (Kreditangaben)',
      3: 'Schritt 3 von 3 (Bestätigung, nicht abgeschickt)',
    };
    const etapeLabel = stepLabels[parseInt(etape)] || `Schritt ${etape}`;

    const localisation = req.body.visiteurLocalisationAffichage
      || [req.body.visiteurVille, req.body.visiteurPays].filter(Boolean).join(', ')
      || req.ip
      || 'Unbekannt';

    console.log(`⚠️  Abandon formulaire : ${email} | ${etapeLabel} | ${localisation}`);

    // Envoi email d'alerte au conseiller (non bloquant)
    setImmediate(async () => {
      try {
        await emailService.emailAlertAbandon({
          email,
          vorname:                       req.body.vorname || '',
          nachname:                       req.body.nachname || '',
          telefon:                        req.body.telefon || '',
          kreditart:                      req.body.kreditart || '',
          kreditbetrag:                   req.body.kreditbetrag || '',
          laufzeit:                       req.body.laufzeit || '',
          etapeLabel,
          visiteurLocalisationAffichage:  localisation,
          ipAdresse:                      req.ip || '',
          pageUrl:                        req.headers.referer || req.headers.origin || '',
        });
      } catch (err) {
        console.error('Erreur email abandon :', err.message);
      }
    });

    res.status(200).json({
      success: true,
      message: 'Abandon enregistré',
    });

  } catch (error) {
    next(error);
  }
};

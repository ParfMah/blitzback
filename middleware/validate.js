/**
 * BLITZ LEIHEN — Middleware de validation
 *
 * Règles de validation pour chaque endpoint :
 *   - validationDemande   : POST /api/demandes
 *   - validationLogin     : POST /api/auth/login
 *   - validationStatut    : PUT /api/demandes/:id/statut
 *
 * Utilise express-validator.
 * La fonction handleValidation() centralise la réponse d'erreur.
 */

const { body, param, validationResult } = require('express-validator');

/* ----------------------------------------------------------
   HANDLER CENTRALISÉ
   Vérifie les erreurs de validation et renvoie une réponse
   structurée si des champs sont invalides.
   Doit être appelé EN DERNIER dans le tableau de middlewares.
---------------------------------------------------------- */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Formater les erreurs : { champ: message }
    const formatted = {};
    errors.array().forEach(err => {
      if (!formatted[err.path]) {
        formatted[err.path] = err.msg;
      }
    });

    return res.status(422).json({
      success: false,
      message: 'Ungültige Formulardaten. Bitte überprüfen Sie Ihre Eingaben.',
      errors:  formatted,
    });
  }

  next();
};

/* ----------------------------------------------------------
   RÈGLES : Soumission d'une demande de prêt
   Valide les données du formulaire frontend (kreditantrag.html)
---------------------------------------------------------- */
const validationDemande = [
  /* --- Informations personnelles --- */
  body('vorname')
    .trim()
    .notEmpty().withMessage('Vorname ist erforderlich')
    .isLength({ max: 50 }).withMessage('Vorname: max. 50 Zeichen'),

  body('nachname')
    .trim()
    .notEmpty().withMessage('Nachname ist erforderlich')
    .isLength({ max: 50 }).withMessage('Nachname: max. 50 Zeichen'),

  body('geburtsdatum')
    .notEmpty().withMessage('Geburtsdatum ist erforderlich')
    .isISO8601().withMessage('Ungültiges Datumsformat')
    .custom((val) => {
      const date  = new Date(val);
      const today = new Date();
      let age = today.getFullYear() - date.getFullYear();
      const m = today.getMonth() - date.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
      if (age < 18) throw new Error('Mindestalter ist 18 Jahre');
      if (age > 90) throw new Error('Ungültiges Geburtsdatum');
      return true;
    }),

  body('email')
    .trim()
    .notEmpty().withMessage('E-Mail ist erforderlich')
    .isEmail().withMessage('Ungültige E-Mail-Adresse')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('telefon')
    .trim()
    .notEmpty().withMessage('Telefonnummer ist erforderlich')
    .matches(/^[\+]?[\d\s\-\(\)]{8,20}$/)
    .withMessage('Ungültige Telefonnummer'),

  body('adresse')
    .trim()
    .notEmpty().withMessage('Adresse ist erforderlich')
    .isLength({ max: 200 }).withMessage('Adresse: max. 200 Zeichen'),

  body('ort')
    .trim()
    .notEmpty().withMessage('Ort/PLZ ist erforderlich')
    .isLength({ max: 100 }).withMessage('Ort: max. 100 Zeichen'),

  body('land')
    .trim()
    .notEmpty().withMessage('Wohnsitzland ist erforderlich'),

  body('beschaeftigung')
    .notEmpty().withMessage('Beschäftigungsstatus ist erforderlich')
    .isIn([
      'Angestellt (unbefristet)', 'Angestellt (befristet)',
      'Selbstständig', 'Beamter', 'Rentner',
      'Student', 'Arbeitssuchend', 'Sonstiges',
    ]).withMessage('Ungültiger Beschäftigungsstatus'),

  body('einkommen')
    .notEmpty().withMessage('Monatliches Einkommen ist erforderlich')
    .isNumeric().withMessage('Einkommen muss eine Zahl sein')
    .custom(v => {
      const val = parseFloat(v);
      if (val < 0)       throw new Error('Einkommen kann nicht negativ sein');
      if (val > 1000000) throw new Error('Ungültiger Einkommenswert');
      return true;
    }),

  /* --- Informations du prêt --- */
  body('kreditart')
    .notEmpty().withMessage('Kreditart ist erforderlich')
    .isIn([
      'Privatkredit', 'Immobilienkredit', 'Autofinanzierung',
      'Renovierungskredit', 'Hypothekenkredit', 'Umschuldung',
    ]).withMessage('Ungültige Kreditart'),

  body('kreditbetrag')
    .notEmpty().withMessage('Kreditbetrag ist erforderlich')
    .isNumeric().withMessage('Kreditbetrag muss eine Zahl sein')
    .custom(v => {
      const val = parseFloat(v);
      if (val < 1000)    throw new Error('Mindestbetrag ist 1.000 €');
      if (val > 2000000) throw new Error('Maximalbetrag ist 2.000.000 €');
      return true;
    }),

  body('laufzeit')
    .notEmpty().withMessage('Laufzeit ist erforderlich')
    .isNumeric().withMessage('Laufzeit muss eine Zahl sein')
    .custom(v => {
      const val = parseInt(v);
      if (val < 6)   throw new Error('Mindestlaufzeit: 6 Monate');
      if (val > 360) throw new Error('Maximallaufzeit: 360 Monate');
      return true;
    }),

  body('verwendungszweck')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Verwendungszweck: max. 1000 Zeichen'),

  body('sms_verification')
    .optional()
    .isIn(['ja', 'nein']).withMessage('Ungültiger SMS-Wert'),

  /* --- Consentements obligatoires --- */
  body('datenschutz')
    .custom(v => {
      if (v !== true && v !== 'true' && v !== 1) {
        throw new Error('Datenschutzerklärung muss akzeptiert werden');
      }
      return true;
    }),

  body('agb')
    .custom(v => {
      if (v !== true && v !== 'true' && v !== 1) {
        throw new Error('AGB müssen akzeptiert werden');
      }
      return true;
    }),

  body('schufa_zustimmung')
    .custom(v => {
      if (v !== true && v !== 'true' && v !== 1) {
        throw new Error('SCHUFA-Zustimmung ist erforderlich');
      }
      return true;
    }),

  handleValidation,
];

/* ----------------------------------------------------------
   RÈGLES : Connexion administrateur
---------------------------------------------------------- */
const validationLogin = [
  body('username')
    .trim()
    .notEmpty().withMessage('E-Mail ist erforderlich')
    .isEmail().withMessage('Ungültige E-Mail-Adresse')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty().withMessage('Passwort ist erforderlich')
    .isLength({ min: 6 }).withMessage('Passwort: min. 6 Zeichen'),

  handleValidation,
];

/* ----------------------------------------------------------
   RÈGLES : Changement de statut d'une demande
---------------------------------------------------------- */
const validationStatut = [
  param('id')
    .isMongoId().withMessage('Ungültige Antrags-ID'),

  body('statut')
    .notEmpty().withMessage('Neuer Status ist erforderlich')
    .isIn(['Neu', 'Analyse', 'Akzeptiert', 'Abgelehnt'])
    .withMessage('Ungültiger Status — erlaubt: Neu, Analyse, Akzeptiert, Abgelehnt'),

  body('commentaire')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Kommentar: max. 500 Zeichen'),

  handleValidation,
];

/* ----------------------------------------------------------
   RÈGLES : Validation d'un ID MongoDB générique
---------------------------------------------------------- */
const validationMongoId = [
  param('id')
    .isMongoId().withMessage('Ungültige ID'),
  handleValidation,
];

/* ----------------------------------------------------------
   RÈGLES : Formulaire de contact (page kontakt.html)
   Message libre, séparé de la demande de prêt (kreditantrag.html)
---------------------------------------------------------- */
const validationContact = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name ist erforderlich')
    .isLength({ max: 100 }).withMessage('Name: max. 100 Zeichen'),

  body('email')
    .trim()
    .notEmpty().withMessage('E-Mail ist erforderlich')
    .isEmail().withMessage('Ungültige E-Mail-Adresse')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('telefon')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[\+]?[\d\s\-\(\)]{8,20}$/)
    .withMessage('Ungültige Telefonnummer'),

  body('betreff')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 150 }).withMessage('Betreff: max. 150 Zeichen'),

  body('nachricht')
    .trim()
    .notEmpty().withMessage('Nachricht ist erforderlich')
    .isLength({ min: 10, max: 3000 }).withMessage('Nachricht: 10–3000 Zeichen'),

  body('datenschutz')
    .custom(v => {
      if (v !== true && v !== 'true' && v !== 1) {
        throw new Error('Datenschutzerklärung muss akzeptiert werden');
      }
      return true;
    }),

  handleValidation,
];

module.exports = {
  validationDemande,
  validationLogin,
  validationStatut,
  validationMongoId,
  validationContact,
  handleValidation,
};

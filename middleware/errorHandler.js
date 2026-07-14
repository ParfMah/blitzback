/**
 * BLITZ LEIHEN — Gestionnaire global des erreurs
 *
 * Intercepte toutes les erreurs non gérées dans l'application.
 * Normalise les erreurs Mongoose, JWT, et génériques
 * en réponses JSON structurées.
 *
 * Toujours déclaré en DERNIER dans server.js (après les routes).
 */

const errorHandler = (err, req, res, next) => {
  // Log complet en développement, minimal en production
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Erreur :', err);
  } else {
    console.error(`❌ [${new Date().toISOString()}] ${err.message}`);
  }

  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Interner Serverfehler';
  let errors     = null;

  /* ----------------------------------------------------------
     ERREURS MONGOOSE — Validation
     Exemple : champ requis manquant, type incorrect
  ---------------------------------------------------------- */
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message    = 'Datenbankvalidierung fehlgeschlagen';
    errors = {};
    Object.keys(err.errors).forEach(key => {
      errors[key] = err.errors[key].message;
    });
  }

  /* ----------------------------------------------------------
     ERREURS MONGOOSE — Duplication (index unique)
     Exemple : email déjà utilisé, référence déjà existante
  ---------------------------------------------------------- */
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'Feld';
    message = `${field} ist bereits vergeben. Bitte verwenden Sie einen anderen Wert.`;
  }

  /* ----------------------------------------------------------
     ERREURS MONGOOSE — ID invalide (CastError)
     Exemple : ID MongoDB mal formé dans les params
  ---------------------------------------------------------- */
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message    = `Ungültige ID : ${err.value}`;
  }

  /* ----------------------------------------------------------
     ERREURS JWT — Token invalide ou expiré
  ---------------------------------------------------------- */
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message    = 'Ungültiges Token — bitte erneut anmelden';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message    = 'Sitzung abgelaufen — bitte erneut anmelden';
  }

  /* ----------------------------------------------------------
     ERREURS CORS
  ---------------------------------------------------------- */
  if (err.message && err.message.startsWith('Origine non autorisée')) {
    statusCode = 403;
    message    = 'CORS-Fehler: Zugriff verweigert';
  }

  /* ----------------------------------------------------------
     RÉPONSE FINALE
     En production : pas de stack trace exposée
  ---------------------------------------------------------- */
  const response = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack,
      type:  err.name,
    }),
  };

  res.status(statusCode).json(response);
};

/* ----------------------------------------------------------
   HELPER : Créer une erreur avec un code HTTP personnalisé
   Usage : throw createError(404, 'Antrag nicht gefunden')
---------------------------------------------------------- */
const createError = (statusCode, message) => {
  const error       = new Error(message);
  error.statusCode  = statusCode;
  return error;
};

module.exports = errorHandler;
module.exports.createError = createError;

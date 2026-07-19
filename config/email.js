/**
 * BLITZ LEIHEN — Configuration email
 *
 * Crée et exporte un transporter Nodemailer réutilisable.
 * Compatible avec : Gmail, SMTP générique (Mailgun, OVH, Ionos...).
 *
 * Configuration via variables d'environnement (.env) :
 *   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS
 */

const nodemailer = require('nodemailer');

/**
 * Crée le transporter SMTP.
 * Le transporter est créé une seule fois (singleton).
 *
 * Supporte les deux jeux de variables :
 *   - SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS (actuel, ex. Brevo)
 *   - EMAIL_HOST / EMAIL_PORT / EMAIL_SECURE / EMAIL_USER / EMAIL_PASS (legacy, ex. Gmail)
 * pour éviter qu'un renommage futur des variables ne casse à nouveau l'envoi
 * d'emails de façon silencieuse.
 */
const createTransporter = () => {
  const host   = process.env.SMTP_HOST   || process.env.EMAIL_HOST;
  const port   = process.env.SMTP_PORT   || process.env.EMAIL_PORT;
  const secure = process.env.SMTP_SECURE || process.env.EMAIL_SECURE;
  const user   = process.env.SMTP_USER   || process.env.EMAIL_USER;
  const pass   = process.env.SMTP_PASS   || process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '⚠️  Configuration SMTP incomplète : vérifiez SMTP_HOST/SMTP_USER/SMTP_PASS ' +
      '(ou EMAIL_HOST/EMAIL_USER/EMAIL_PASS) dans le fichier .env.'
    );
  }

  return nodemailer.createTransport({
    host,
    port:   parseInt(port) || 587,
    secure: secure === 'true', // true pour port 465

    auth: {
      user,
      pass,
    },

    // Timeout pour éviter les blocages
    connectionTimeout: 10000,
    greetingTimeout:   10000,

    // En développement : accepte les certificats auto-signés
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
};

// Instance unique du transporter
const transporter = createTransporter();

/**
 * Vérifie que la connexion SMTP fonctionne.
 * Appelé au démarrage du serveur.
 */
const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email SMTP connecté :', process.env.SMTP_HOST || process.env.EMAIL_HOST);
  } catch (error) {
    console.warn('⚠️  Email SMTP non disponible :', error.message);
    console.warn('   Les emails ne seront pas envoyés.');
  }
};

module.exports = { transporter, verifyEmailConnection };

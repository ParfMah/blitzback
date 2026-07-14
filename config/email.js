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
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true pour port 465

    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
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
    console.log('✅ Email SMTP connecté :', process.env.EMAIL_HOST);
  } catch (error) {
    console.warn('⚠️  Email SMTP non disponible :', error.message);
    console.warn('   Les emails ne seront pas envoyés.');
  }
};

module.exports = { transporter, verifyEmailConnection };

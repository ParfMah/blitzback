/**
 * BLITZ LEIHEN — Script de création du premier Admin
 *
 * Exécuter UNE SEULE FOIS après le premier déploiement :
 *   node scripts/seedAdmin.js
 *
 * Utilise les variables ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME du .env
 * Changer le mot de passe immédiatement après la première connexion.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Admin    = require('../models/Admin');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté');

    // Vérifier si un admin existe déjà
    const existant = await Admin.findOne({ email: process.env.ADMIN_EMAIL });

    if (existant) {
      console.log('ℹ️  Admin déjà existant :', existant.email);
      console.log('   Aucune action effectuée.');
      process.exit(0);
    }

    // Créer le premier admin
    const admin = await Admin.create({
      name:     process.env.ADMIN_NAME     || 'Administrateur',
      email:    process.env.ADMIN_EMAIL    || 'admin@blitz-leihen.de',
      password: process.env.ADMIN_PASSWORD || 'BlitzAdmin2025!',
      role:     'superadmin',
      actif:    true,
    });

    console.log('✅ Admin créé avec succès !');
    console.log('   Email    :', admin.email);
    console.log('   Rôle     :', admin.role);
    console.log('   ⚠️  Changer le mot de passe dès la première connexion !');
    process.exit(0);

  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
}

seed();

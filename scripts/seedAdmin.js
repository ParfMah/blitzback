/**
 * BLITZ LEIHEN — Script de création du premier Admin
 *
 * Exécuter UNE SEULE FOIS après le premier déploiement :
 *   node scripts/seedAdmin.js
 *
 * Utilise les variables ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME du .env
 * Changer le mot de passe immédiatement après la première connexion.
 */

/** 
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
**/

/**
 * BLITZ LEIHEN — Script de création des Admins / Conseillers
 * Exécution : node scripts/seedAdmin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Admin    = require('../models/Admin');

// Liste de tes administrateurs / conseillers à créer
const adminsToCreate = [
  {
    name:     'Administrateur Principal',
    email:    process.env.ADMIN_EMAIL    || 'admin@blitz-leihen.de',
    password: process.env.ADMIN_PASSWORD || 'BlitzAdmin2025!',
    role:     'superadmin',
    actif:    true,
  },
  {
    name:     'Conseiller 1',
    email:    'parfkpalika1990@gmail.com',
    password: 'ConseillerBlitz1!',
    role:     'admin', // ou 'conseiller' selon ton schéma
    actif:    true,
  },
  {
    name:     'Conseiller 2',
    email:    'parfkp@gmail.com',
    password: 'ConseillerBlitz2!',
    role:     'admin',
    actif:    true,
  },
  {
    name:     'Conseiller 3',
    email:    'jeanlucclaudel01@gmail.com',
    password: 'ConseillerBlitz3!',
    role:     'admin',
    actif:    true,
  },
  {
    name:     'Conseiller 4',
    email:    'jeanlucclaudel02@gmail.com',
    password: 'ConseillerBlitz4!',
    role:     'admin',
    actif:    true,
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté');

    for (const data of adminsToCreate) {
      // Vérifier si cet admin existe déjà par son email
      const existant = await Admin.findOne({ email: data.email });

      if (existant) {
        console.log(`ℹ️  Admin déjà existant : ${data.email}`);
        continue; // Passe au suivant
      }

      // Créer l'admin (le hachage du mot passe est généralement géré par un pre-save hook dans le modèle Admin.js)
      const admin = await Admin.create(data);

      console.log(`✅ Admin créé avec succès : ${admin.email} (Rôle: ${admin.role})`);
    }

    console.log('\n🎉 Opération de seeding terminée !');
    process.exit(0);

  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
}

seed();
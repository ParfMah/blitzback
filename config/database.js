/**
 * BLITZ LEIHEN — Configuration base de données
 *
 * Connexion à MongoDB Atlas via Mongoose.
 * Gère la reconnexion automatique et les événements de connexion.
 */

const mongoose = require('mongoose');

/**
 * Connecte l'application à MongoDB Atlas.
 * Appelé au démarrage du serveur dans server.js.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Options recommandées pour la stabilité en production
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
    console.log(`   Base de données  : ${conn.connection.name}`);

  } catch (error) {
    console.error('❌ Erreur connexion MongoDB :', error.message);
    // Arrêt du processus si la DB est inaccessible au démarrage
    process.exit(1);
  }
};

// Événements Mongoose pour le monitoring
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB déconnecté — tentative de reconnexion...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnecté');
});

// Fermeture propre de la connexion à l'arrêt du serveur
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB fermé proprement (SIGINT)');
  process.exit(0);
});

module.exports = connectDB;

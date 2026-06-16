const mongoose = require('mongoose');

let isConnected = false;

const connectMongoDB = async () => {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('[MongoDB] MONGO_URI not set — skipping MongoDB Atlas connection.');
    return;
  }

  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, {
      dbName: 'toolcase_auth',       // dedicated auth database
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('MongoDB Atlas connected successfully!');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Will attempt to reconnect...');
      isConnected = false;
    });
  } catch (err) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      // In production (Render) MongoDB Atlas is required — crash hard
      console.error('FATAL: Failed to connect to MongoDB Atlas:', err.message);
      throw err;
    } else {
      // In local dev — warn and continue (PostgreSQL still works for categories/cards)
      console.warn('[MongoDB] Could not connect to MongoDB Atlas (DNS/network issue in local dev):', err.message);
      console.warn('[MongoDB] Authentication routes will fail locally. Deploy to Render for full functionality.');
    }
  }
};


module.exports = { connectMongoDB };

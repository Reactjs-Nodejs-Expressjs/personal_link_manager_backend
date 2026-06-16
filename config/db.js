const { Pool } = require('pg');

let pool = null;

const connectDB = async () => {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set in environment variables');
    }
    
    console.log('Connecting to PostgreSQL database (Neon)...');
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') 
        ? { rejectUnauthorized: false } 
        : false
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err.message);
    });
    
    // Test the database connection
    const client = await pool.connect();
    console.log('PostgreSQL (Neon) connected successfully!');
    client.release();
  } catch (error) {
    console.error('\n======================================================');
    console.error('ERROR: Failed to connect to PostgreSQL database:');
    console.error(error.message);
    console.error('======================================================\n');
    process.exit(1);
  }
};

const getPool = () => pool;
const getFallbackMode = () => false;

module.exports = {
  connectDB,
  getPool,
  getFallbackMode
};

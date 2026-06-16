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
        : false,
      // Optimised pool settings for Neon serverless
      max: 5,                // Keep max connections low for serverless
      min: 1,                // Keep 1 connection alive at all times
      idleTimeoutMillis: 30000,   // Close idle connections after 30s
      connectionTimeoutMillis: 10000, // Timeout if can't get connection in 10s
      keepAlive: true,            // Send TCP keepalive packets
      keepAliveInitialDelayMillis: 10000,
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err.message);
    });
    
    // Test the database connection
    const client = await pool.connect();
    console.log('PostgreSQL (Neon) connected successfully!');
    client.release();

    // Create performance indexes after connection is confirmed
    await createIndexes();

  } catch (error) {
    console.error('\n======================================================');
    console.error('ERROR: Failed to connect to PostgreSQL database:');
    console.error(error.message);
    console.error('======================================================\n');
    process.exit(1);
  }
};

// Create indexes to speed up common queries
const createIndexes = async () => {
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cards_is_active ON cards(is_active);
      CREATE INDEX IF NOT EXISTS idx_cards_category_id ON cards(category_id);
      CREATE INDEX IF NOT EXISTS idx_cards_sub_category_id ON cards(sub_category_id);
      CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cards_title_trgm ON cards USING gin(to_tsvector('english', title))
        WHERE title IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
      CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
    `);
    console.log('Performance indexes ensured.');
  } catch (err) {
    // Non-fatal: pg_trgm might not be available on all Neon plans
    console.warn('Index creation warning (non-fatal):', err.message.split('\n')[0]);
    // Try without the trigram index
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_cards_is_active ON cards(is_active);
        CREATE INDEX IF NOT EXISTS idx_cards_category_id ON cards(category_id);
        CREATE INDEX IF NOT EXISTS idx_cards_sub_category_id ON cards(sub_category_id);
        CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
        CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
      `);
      console.log('Basic performance indexes ensured.');
    } catch (e2) {
      console.warn('Could not create basic indexes:', e2.message.split('\n')[0]);
    }
  }
};

const getPool = () => pool;
const getFallbackMode = () => false;

module.exports = {
  connectDB,
  getPool,
  getFallbackMode
};

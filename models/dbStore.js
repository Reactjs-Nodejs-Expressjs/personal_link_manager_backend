const { getPool } = require('../config/db');

// Helper to generate 24-char hex IDs matching ObjectID formats
const generateHexId = () => {
  return Array.from({ length: 24 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
};

// Map Postgres admin row to model schema
const mapAdmin = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    email: row.email,
    password: row.password,
    role: row.role,
    lastLogin: row.last_login,
    otp: row.otp,
    otpExpiry: row.otp_expiry,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Map Postgres category row to model schema
const mapCategory = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    type: row.type,
    parentId: row.parent_id,
    order: row.item_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Map Postgres card row to model schema
const mapCard = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    subCategoryId: row.sub_category_id,
    subSubCategoryId: row.sub_sub_category_id,
    websiteUrl: row.website_url,
    websiteIframe: row.website_iframe,
    price: row.price ? Number(row.price) : null,
    currency: row.currency,
    rating: {
      average: row.rating_average ? Number(row.rating_average) : 0,
      count: row.rating_count ? Number(row.rating_count) : 0
    },
    images: row.images || [],
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: row.category_name || '',
    subCategoryName: row.sub_category_name || '',
    subSubCategoryName: row.sub_sub_category_name || ''
  };
};

// DB Store Wrapper for PostgreSQL
const dbStore = {
  isFallback: () => false,

  // Table setup
  init: async () => {
    const pool = getPool();
    console.log('Initializing PostgreSQL tables...');
    
    // Create admins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        last_login TIMESTAMP,
        otp VARCHAR(6),
        otp_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        parent_id VARCHAR(50) REFERENCES categories(id) ON DELETE CASCADE,
        item_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create cards table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
        sub_category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
        sub_sub_category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
        website_url VARCHAR(1000) NOT NULL,
        website_iframe VARCHAR(1000),
        price NUMERIC(10,2),
        currency VARCHAR(10) DEFAULT 'USD',
        rating_average NUMERIC(3,2) DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        images TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(50),
        updated_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('PostgreSQL tables initialized successfully.');
  },

  // ADMIN OPERATIONS
  admins: {
    findOne: async (query) => {
      const pool = getPool();
      let sql = 'SELECT * FROM admins WHERE 1=1';
      const params = [];
      let pIdx = 1;
      
      if (query.email) {
        sql += ` AND LOWER(email) = LOWER($${pIdx++})`;
        params.push(query.email);
      }
      if (query._id || query.id) {
        sql += ` AND id = $${pIdx++}`;
        params.push(query._id || query.id);
      }
      
      const res = await pool.query(sql, params);
      return mapAdmin(res.rows[0]);
    },

    create: async (data) => {
      const pool = getPool();
      const id = data._id || generateHexId();
      const sql = `
        INSERT INTO admins (id, email, password, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const res = await pool.query(sql, [id, data.email, data.password, data.role || 'admin']);
      return mapAdmin(res.rows[0]);
    },

    findByIdAndUpdate: async (id, updateData) => {
      const pool = getPool();
      const fields = [];
      const params = [id];
      let pIdx = 2;
      
      if (updateData.password !== undefined) {
        fields.push(`password = $${pIdx++}`);
        params.push(updateData.password);
      }
      if (updateData.lastLogin !== undefined) {
        fields.push(`last_login = $${pIdx++}`);
        params.push(updateData.lastLogin);
      }
      if (updateData.otp !== undefined) {
        fields.push(`otp = $${pIdx++}`);
        params.push(updateData.otp);
      }
      if (updateData.otpExpiry !== undefined) {
        fields.push(`otp_expiry = $${pIdx++}`);
        params.push(updateData.otpExpiry);
      }
      
      if (fields.length === 0) return await dbStore.admins.findOne({ _id: id });
      
      const sql = `
        UPDATE admins 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      const res = await pool.query(sql, params);
      return mapAdmin(res.rows[0]);
    }
  },

  // CATEGORY OPERATIONS
  categories: {
    find: async (query = {}) => {
      const pool = getPool();
      let sql = 'SELECT * FROM categories WHERE 1=1';
      const params = [];
      let pIdx = 1;
      
      if (query.type) {
        sql += ` AND type = $${pIdx++}`;
        params.push(query.type);
      }
      if ('parentId' in query) {
        if (query.parentId === null) {
          sql += ` AND parent_id IS NULL`;
        } else {
          sql += ` AND parent_id = $${pIdx++}`;
          params.push(query.parentId);
        }
      }
      if ('isActive' in query) {
        sql += ` AND is_active = $${pIdx++}`;
        params.push(query.isActive);
      }
      
      sql += ' ORDER BY item_order ASC, name ASC';
      const res = await pool.query(sql, params);
      return res.rows.map(mapCategory);
    },

    findOne: async (query) => {
      const pool = getPool();
      let sql = 'SELECT * FROM categories WHERE 1=1';
      const params = [];
      let pIdx = 1;
      
      if (query._id) {
        sql += ` AND id = $${pIdx++}`;
        params.push(query._id);
      }
      if (query.name) {
        sql += ` AND LOWER(name) = LOWER($${pIdx++})`;
        params.push(query.name);
      }
      
      const res = await pool.query(sql, params);
      return mapCategory(res.rows[0]);
    },

    findById: async (id) => {
      const pool = getPool();
      const res = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
      return mapCategory(res.rows[0]);
    },

    create: async (data) => {
      const pool = getPool();
      const id = data._id || generateHexId();
      const sql = `
        INSERT INTO categories (id, name, type, parent_id, item_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const res = await pool.query(sql, [
        id,
        data.name,
        data.type,
        data.parentId || null,
        data.order || 0,
        data.isActive !== undefined ? data.isActive : true
      ]);
      return mapCategory(res.rows[0]);
    },

    findByIdAndUpdate: async (id, updateData) => {
      const pool = getPool();
      const fields = [];
      const params = [id];
      let pIdx = 2;
      
      if (updateData.name !== undefined) {
        fields.push(`name = $${pIdx++}`);
        params.push(updateData.name);
      }
      if (updateData.type !== undefined) {
        fields.push(`type = $${pIdx++}`);
        params.push(updateData.type);
      }
      if (updateData.parentId !== undefined) {
        fields.push(`parent_id = $${pIdx++}`);
        params.push(updateData.parentId || null);
      }
      if (updateData.order !== undefined) {
        fields.push(`item_order = $${pIdx++}`);
        params.push(updateData.order);
      }
      if (updateData.isActive !== undefined) {
        fields.push(`is_active = $${pIdx++}`);
        params.push(updateData.isActive);
      }
      
      if (fields.length === 0) return await dbStore.categories.findById(id);
      
      const sql = `
        UPDATE categories 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      const res = await pool.query(sql, params);
      return mapCategory(res.rows[0]);
    },

    findByIdAndDelete: async (id) => {
      const pool = getPool();
      const category = await dbStore.categories.findById(id);
      if (!category) return null;
      
      await pool.query('DELETE FROM categories WHERE id = $1', [id]);
      return category;
    }
  },

  // CARD OPERATIONS
  cards: {
    find: async (query = {}, options = {}) => {
      const pool = getPool();
      const { limit = 20, page = 1 } = options;
      const skip = (page - 1) * limit;
      
      let baseSql = `
        FROM cards c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN categories sub ON c.sub_category_id = sub.id
        LEFT JOIN categories subsub ON c.sub_sub_category_id = subsub.id
        WHERE 1=1
      `;
      const params = [];
      let pIdx = 1;
      
      if ('isActive' in query) {
        baseSql += ` AND c.is_active = $${pIdx++}`;
        params.push(query.isActive);
      }
      if (query.categoryId) {
        baseSql += ` AND c.category_id = $${pIdx++}`;
        params.push(query.categoryId);
      }
      if (query.subCategoryId) {
        baseSql += ` AND c.sub_category_id = $${pIdx++}`;
        params.push(query.subCategoryId);
      }
      if (query.subSubCategoryId) {
        baseSql += ` AND c.sub_sub_category_id = $${pIdx++}`;
        params.push(query.subSubCategoryId);
      }
      if (query.title) {
        baseSql += ` AND c.title ILIKE $${pIdx++}`;
        params.push(`%${query.title}%`);
      }

      const selectSql = `
        SELECT c.*, 
               cat.name as category_name, 
               sub.name as sub_category_name, 
               subsub.name as sub_sub_category_name
        ${baseSql}
        ORDER BY c.created_at DESC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `;
      
      // Run COUNT and SELECT in parallel — cuts round-trip time in half
      const [countRes, res] = await Promise.all([
        pool.query(`SELECT COUNT(*) ${baseSql}`, params),
        pool.query(selectSql, [...params, limit, skip])
      ]);

      const total = parseInt(countRes.rows[0].count, 10);
      
      return {
        cards: res.rows.map(mapCard),
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1
      };
    },

    findById: async (id) => {
      const pool = getPool();
      const sql = `
        SELECT c.*, 
               cat.name as category_name, 
               sub.name as sub_category_name, 
               subsub.name as sub_sub_category_name
        FROM cards c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN categories sub ON c.sub_category_id = sub.id
        LEFT JOIN categories subsub ON c.sub_sub_category_id = subsub.id
        WHERE c.id = $1
      `;
      const res = await pool.query(sql, [id]);
      return mapCard(res.rows[0]);
    },

    create: async (data) => {
      const pool = getPool();
      const id = data._id || generateHexId();
      const ratingAverage = data.rating?.average || 0;
      const ratingCount = data.rating?.count || 0;
      
      const sql = `
        INSERT INTO cards (
          id, title, description, category_id, sub_category_id, sub_sub_category_id, 
          website_url, website_iframe, price, currency, rating_average, rating_count, 
          images, is_active, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;
      
      await pool.query(sql, [
        id,
        data.title,
        data.description,
        data.categoryId || null,
        data.subCategoryId || null,
        data.subSubCategoryId || null,
        data.websiteUrl,
        data.websiteIframe || data.websiteUrl,
        data.price !== undefined ? Number(data.price) : null,
        data.currency || 'USD',
        ratingAverage,
        ratingCount,
        data.images || [],
        data.isActive !== undefined ? data.isActive : true,
        data.createdBy || null,
        data.updatedBy || null
      ]);
      
      return await dbStore.cards.findById(id);
    },

    findByIdAndUpdate: async (id, updateData) => {
      const pool = getPool();
      const fields = [];
      const params = [id];
      let pIdx = 2;
      
      if (updateData.title !== undefined) {
        fields.push(`title = $${pIdx++}`);
        params.push(updateData.title);
      }
      if (updateData.description !== undefined) {
        fields.push(`description = $${pIdx++}`);
        params.push(updateData.description);
      }
      if (updateData.categoryId !== undefined) {
        fields.push(`category_id = $${pIdx++}`);
        params.push(updateData.categoryId || null);
      }
      if (updateData.subCategoryId !== undefined) {
        fields.push(`sub_category_id = $${pIdx++}`);
        params.push(updateData.subCategoryId || null);
      }
      if (updateData.subSubCategoryId !== undefined) {
        fields.push(`sub_sub_category_id = $${pIdx++}`);
        params.push(updateData.subSubCategoryId || null);
      }
      if (updateData.websiteUrl !== undefined) {
        fields.push(`website_url = $${pIdx++}`);
        params.push(updateData.websiteUrl);
      }
      if (updateData.websiteIframe !== undefined) {
        fields.push(`website_iframe = $${pIdx++}`);
        params.push(updateData.websiteIframe);
      }
      if (updateData.price !== undefined) {
        fields.push(`price = $${pIdx++}`);
        params.push(updateData.price !== null ? Number(updateData.price) : null);
      }
      if (updateData.currency !== undefined) {
        fields.push(`currency = $${pIdx++}`);
        params.push(updateData.currency);
      }
      if (updateData.rating?.average !== undefined) {
        fields.push(`rating_average = $${pIdx++}`);
        params.push(Number(updateData.rating.average));
      }
      if (updateData.rating?.count !== undefined) {
        fields.push(`rating_count = $${pIdx++}`);
        params.push(Number(updateData.rating.count));
      }
      if (updateData.images !== undefined) {
        fields.push(`images = $${pIdx++}`);
        params.push(updateData.images);
      }
      if (updateData.isActive !== undefined) {
        fields.push(`is_active = $${pIdx++}`);
        params.push(updateData.isActive);
      }
      if (updateData.updatedBy !== undefined) {
        fields.push(`updated_by = $${pIdx++}`);
        params.push(updateData.updatedBy);
      }
      
      if (fields.length > 0) {
        const sql = `
          UPDATE cards 
          SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `;
        await pool.query(sql, params);
      }
      
      return await dbStore.cards.findById(id);
    },

    findByIdAndDelete: async (id) => {
      const pool = getPool();
      const card = await dbStore.cards.findById(id);
      if (!card) return null;
      
      await pool.query('DELETE FROM cards WHERE id = $1', [id]);
      return card;
    }
  }
};

module.exports = dbStore;

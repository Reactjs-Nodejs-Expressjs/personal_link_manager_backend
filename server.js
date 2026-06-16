const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const { connectDB } = require('./config/db');
const dbStore = require('./models/dbStore');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serving mock tool website previews for scrollable iframe previews
app.get('/embed/tool/:slug', (req, res) => {
  const slug = req.params.slug;
  const toolName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  // Custom styled scrollable preview pages for iframes
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${toolName} Live Preview</title>
      <style>
        body {
          margin: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #f8fafc;
          padding: 24px;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
        }
        .header {
          border-bottom: 2px solid #3b82f6;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .header h1 {
          font-size: 24px;
          margin: 0;
          color: #60a5fa;
        }
        .badge {
          background: #2563eb;
          color: white;
          padding: 4px 10px;
          border-radius: 99px;
          font-size: 12px;
          display: inline-block;
          margin-top: 6px;
        }
        .section {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .section h2 {
          font-size: 16px;
          margin-top: 0;
          color: #38bdf8;
        }
        ul {
          margin: 0;
          padding-left: 20px;
        }
        li {
          margin-bottom: 8px;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          font-size: 11px;
          color: #64748b;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${toolName}</h1>
          <span class="badge">Professional Grade</span>
        </div>
        
        <div class="section">
          <h2>Product Overview</h2>
          <p>This state-of-the-art ${toolName} has been designed for maximum reliability and ease of use in residential, commercial, and industrial operations. Equipped with ergonomic grip handles, heavy-duty build materials, and precision calibration mechanisms.</p>
        </div>

        <div class="section">
          <h2>Technical Specifications</h2>
          <ul>
            <li>Material: Chrome Vanadium Steel (Cr-V) / Reinforced ABS</li>
            <li>Operational limits: Fully calibrated for high precision tasks</li>
            <li>Ergonomic Handle: Textured non-slip cushioned grip</li>
            <li>Warranty: 5-Year Limited Manufacturer Warranty</li>
            <li>Certifications: CE, ANSI, ISO 9001 Compliant</li>
          </ul>
        </div>

        <div class="section">
          <h2>Safety Features</h2>
          <ul>
            <li>Integrated insulation safeguards (up to 1000V where applicable)</li>
            <li>Auto-locking safety switches to prevent accidental damage</li>
            <li>Thermal overload cut-off mechanisms</li>
          </ul>
        </div>

        <div class="section">
          <h2>Quick Usage Guide</h2>
          <p>1. Ensure all safety gear (gloves, eyewear) is worn before operation.</p>
          <p>2. Align the tool with the target surface or component.</p>
          <p>3. Apply gradual force or turn on power switches according to the instruction manual.</p>
          <p>4. Clean debris from tool surfaces after use and store in dry cases.</p>
        </div>

        <div class="footer">
          <p>Copyright © 2026 ToolCase Systems Inc. All rights reserved. Live iframe render mock site.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/category'));
app.use('/api/cards', require('./routes/card'));

// Serve static assets in production (optional placeholder)
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Case Tool Category Management API', fallbackDB: dbStore.isFallback() });
});

// Database seeding helper
const seedDatabase = async () => {
  try {
    console.log('Checking database status to perform seeding...');
    
    // 1. Seed Admin if none exist
    const adminEmail = process.env.ADMIN_EMAIL || 'akhilthadaka97@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    let admin = await dbStore.admins.findOne({ email: adminEmail });
    if (!admin) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      admin = await dbStore.admins.create({
        email: adminEmail,
        password: hashedPassword,
        role: 'admin'
      });
      console.log(`Default admin created: ${adminEmail} (password: ${adminPassword})`);
    } else {
      console.log('Admin user already exists.');
    }

    // 2. Seed Categories if none exist
    const categoriesCount = await dbStore.categories.find({});
    if (categoriesCount.length === 0) {
      console.log('Categories empty. Seeding default structure...');
      
      const structure = [
        {
          name: 'Electrical Tools',
          type: 'category',
          subcategories: [
            {
              name: 'Wiring Tools',
              type: 'subcategory',
              subsubcategories: ['Wire Strippers', 'Crimpers']
            },
            {
              name: 'Testing Equipment',
              type: 'subcategory',
              subsubcategories: ['Multimeters', 'Voltage Testers']
            }
          ]
        },
        {
          name: 'Mechanical Tools',
          type: 'category',
          subcategories: [
            {
              name: 'Hand Tools',
              type: 'subcategory',
              subsubcategories: ['Wrenches', 'Screwdrivers']
            },
            {
              name: 'Power Tools',
              type: 'subcategory',
              subsubcategories: ['Drills', 'Saws']
            }
          ]
        },
        {
          name: 'Safety Equipment',
          type: 'category',
          subcategories: [
            {
              name: 'Personal Protection',
              type: 'subcategory',
              subsubcategories: ['Helmets', 'Gloves']
            },
            {
              name: 'Workplace Safety',
              type: 'subcategory',
              subsubcategories: ['Fire Extinguishers', 'First Aid Kits']
            }
          ]
        }
      ];

      // Insert category tree
      for (let i = 0; i < structure.length; i++) {
        const rootItem = structure[i];
        const rootCat = await dbStore.categories.create({
          name: rootItem.name,
          type: rootItem.type,
          parentId: null,
          order: i,
          isActive: true
        });

        for (let j = 0; j < rootItem.subcategories.length; j++) {
          const subItem = rootItem.subcategories[j];
          const subCat = await dbStore.categories.create({
            name: subItem.name,
            type: subItem.type,
            parentId: rootCat._id.toString(),
            order: j,
            isActive: true
          });

          for (let k = 0; k < subItem.subsubcategories.length; k++) {
            const subSubName = subItem.subsubcategories[k];
            const subSubCat = await dbStore.categories.create({
              name: subSubName,
              type: 'subsubcategory',
              parentId: subCat._id.toString(),
              order: k,
              isActive: true
            });

            // Create a sample card under this subsubcategory
            const slug = subSubName.toLowerCase().replace(/\s+/g, '-');
            const port = process.env.PORT || 5000;
            const embedUrl = `http://localhost:${port}/embed/tool/${slug}`;
            
            await dbStore.cards.create({
              title: `Premium ${subSubName}`,
              description: `Industrial-grade ${subSubName.toLowerCase()} designed for heavy-duty professional operations. Full details are scrollable in the frame above.`,
              categoryId: rootCat._id.toString(),
              subCategoryId: subCat._id.toString(),
              subSubCategoryId: subSubCat._id.toString(),
              websiteUrl: `https://www.google.com/search?q=professional+${slug}`,
              websiteIframe: embedUrl,
              price: Math.floor(Math.random() * 100) + 19.99,
              currency: 'USD',
              rating: {
                average: parseFloat((4.0 + Math.random()).toFixed(1)),
                count: Math.floor(Math.random() * 200) + 10
              },
              images: [],
              isActive: true,
              createdBy: admin._id,
              updatedBy: admin._id
            });
          }
        }
      }
      console.log('Hierarchical category structures and sample cards seeded successfully!');
    } else {
      console.log('Categories and cards already seeded.');
    }
  } catch (err) {
    console.error('Error seeding database:', err.message);
  }
};

// Start Server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  // 1. Connect database (PostgreSQL Neon)
  await connectDB();
  
  // Initialize SQL tables
  await dbStore.init();
  
  // 2. Perform Seeding
  await seedDatabase();

  // 3. Listen
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

startServer();

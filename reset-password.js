require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI not set'); process.exit(1); }

  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, { dbName: 'toolcase_auth', serverSelectionTimeoutMS: 15000 });
    console.log('Connected!');

    const email = 'akhilthadaka97@gmail.com';
    const newPassword = 'Akhil@7777';

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    const result = await Admin.findOneAndUpdate(
      { email },
      { $set: { password: hash } },
      { new: true, upsert: true }
    );

    console.log(`\n✅ Password updated for: ${result.email}`);
    console.log('   New password: Akhil@7777');

    // Verify it works
    const isMatch = await bcrypt.compare(newPassword, result.password);
    console.log(`   Verification: ${isMatch ? '✅ Password matches!' : '❌ Password mismatch!'}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();

require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  console.log('Testing SMTP config:');
  console.log('  Host:', host);
  console.log('  Port:', port);
  console.log('  User:', user);
  console.log('  Pass (length):', pass ? pass.length : 0, '| Pass (no-spaces length):', pass ? pass.replace(/\s/g,'').length : 0);

  // Test 1: With spaces as-is
  console.log('\n--- Test 1: Pass with spaces as-is ---');
  try {
    const t1 = nodemailer.createTransport({ host, port, secure: false, auth: { user, pass }, requireTLS: true });
    await t1.verify();
    console.log('✅ VERIFY SUCCESS (spaces kept)');
  } catch (e) { console.log('❌ FAILED:', e.message); }

  // Test 2: Pass with spaces removed
  const passNoSpaces = pass ? pass.replace(/\s/g, '') : '';
  console.log('\n--- Test 2: Pass with spaces REMOVED ---');
  try {
    const t2 = nodemailer.createTransport({ host, port, secure: false, auth: { user, pass: passNoSpaces }, requireTLS: true });
    await t2.verify();
    console.log('✅ VERIFY SUCCESS (spaces removed)');
    
    // Try sending actual test email
    console.log('\nSending test email...');
    await t2.sendMail({
      from: `"OTP Test" <${user}>`,
      to: user,
      subject: 'SMTP Test - OTP Email',
      text: 'If you received this, SMTP is working correctly!'
    });
    console.log('✅ TEST EMAIL SENT SUCCESSFULLY!');
  } catch (e) { console.log('❌ FAILED:', e.message); }

  process.exit(0);
})();

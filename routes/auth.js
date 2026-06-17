const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Admin = require('../models/Admin');       // ← MongoDB Atlas model
const auth = require('../middleware/auth');

// ─── OTP Email Sender ─────────────────────────────────────────────────────────
// Strategy: Resend API (primary, no SMTP issues) → Gmail SMTP (fallback) → console log
const sendOTPEmail = async (toEmail, otp) => {

  // ── 1. Try Resend API first (most reliable on cloud/Render) ──────────────
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);

      const fromAddr = process.env.RESEND_FROM || 'onboarding@resend.dev';

      const { data, error } = await resend.emails.send({
        from: `ToolCase Admin <${fromAddr}>`,
        to: [toEmail],
        subject: '🔐 Your Admin Login OTP',
        html: buildOTPHtml(otp),
      });

      if (error) {
        console.error('[Resend] ❌ API error:', JSON.stringify(error));
        // fall through to SMTP
      } else {
        console.log(`[Resend] ✅ OTP email sent to ${toEmail} | id: ${data?.id}`);
        return { ok: true, method: 'resend' };
      }
    } catch (err) {
      console.error('[Resend] ❌ Exception:', err.message);
      // fall through to SMTP
    }
  }

  // ── 2. Fallback: Gmail SMTP via Nodemailer ────────────────────────────────
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  // Strip ALL whitespace — Gmail app passwords are shown with spaces for readability
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      await transporter.sendMail({
        from: `"ToolCase Admin" <${user}>`,
        to: toEmail,
        subject: '🔐 Your Admin Login OTP',
        html: buildOTPHtml(otp),
      });

      console.log(`[SMTP] ✅ OTP email sent to ${toEmail}`);
      return { ok: true, method: 'smtp' };

    } catch (err) {
      console.error(`[SMTP] ❌ Failed to send OTP to ${toEmail}`);
      console.error(`[SMTP]    Code   : ${err.code || 'N/A'}`);
      console.error(`[SMTP]    Message: ${err.message}`);
      console.error(`[SMTP]    Resp   : ${err.response || 'N/A'}`);
    }
  } else {
    console.warn('[Email] SMTP not fully configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing or incomplete).');
  }

  // ── 3. Final fallback: print OTP to Render logs ───────────────────────────
  console.log('\n============================');
  console.log('[OTP FALLBACK] Email delivery unavailable — code printed here:');
  console.log(`[OTP FALLBACK] Recipient : ${toEmail}`);
  console.log(`[OTP FALLBACK] Code      : ${otp}`);
  console.log(`[OTP FALLBACK] Expires   : 5 minutes`);
  console.log('============================\n');
  return { ok: false, method: 'console' };
};

// ── HTML template for OTP email ───────────────────────────────────────────────
const buildOTPHtml = (otp) => `
  <div style="font-family:sans-serif;padding:28px;max-width:540px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
    <h2 style="color:#0f172a;margin:0 0 8px;font-size:20px;">Admin Login Code</h2>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Enter this code to sign in to the ToolCase Admin Dashboard:
    </p>
    <div style="margin:0 0 24px;padding:20px;background:#f8fafc;border-radius:12px;text-align:center;border:1px solid #e2e8f0;">
      <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#f97316;font-family:monospace;">${otp}</span>
    </div>
    <p style="color:#94a3b8;font-size:11px;margin:0;">
      ⏱ Expires in <strong>5 minutes</strong>. If you didn't request this, ignore this email.
    </p>
  </div>
`;


// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Step 1: Email → sends OTP, waits for delivery result before responding
router.post('/login', async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: 'Please enter your email address' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(400).json({ message: 'This email is not registered as an administrator.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // Save OTP to MongoDB
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    // ✅ Send email synchronously so we know if it worked
    const result = await sendOTPEmail(admin.email, otp);

    if (!result.ok) {
      // Email failed — tell the admin to check Render logs or use password login
      return res.status(200).json({
        otpRequired: true,
        email: admin.email,
        emailDelivered: false,
        method: result.method,
        message: 'OTP generated but email delivery failed. Check Render logs for the code, or use Password login instead.',
      });
    }

    return res.json({
      otpRequired: true,
      email: admin.email,
      emailDelivered: true,
      method: result.method,
      message: `A 6-digit verification code was sent to your email (via ${result.method}).`,
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// ─── POST /api/auth/login-password ───────────────────────────────────────────
// Alternative: Direct email + password login
router.post('/login-password', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter both email and password' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const payload = { id: admin._id.toString(), email: admin.email, role: admin.role };
    jwt.sign(payload, process.env.JWT_SECRET || 'supersecretjwtkey12345_case_tool_mgmt', { expiresIn: '24h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, admin: { id: admin._id.toString(), email: admin.email, role: admin.role } });
    });
  } catch (err) {
    console.error('Password login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!admin.otp || admin.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP code' });
    }

    if (new Date(admin.otpExpiry).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    admin.otp = null;
    admin.otpExpiry = null;
    admin.lastLogin = new Date();
    await admin.save();

    const payload = { id: admin._id.toString(), email: admin.email, role: admin.role };
    jwt.sign(payload, process.env.JWT_SECRET || 'supersecretjwtkey12345_case_tool_mgmt', { expiresIn: '24h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, admin: { id: admin._id.toString(), email: admin.email, role: admin.role } });
    });
  } catch (err) {
    console.error('Verify-OTP error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
router.get('/verify', auth, (req, res) => {
  res.json({ valid: true, admin: req.admin });
});


// ─── GET /api/auth/email-config ───────────────────────────────────────────────
// Diagnostic: check which email method is configured (safe — no secrets exposed)
router.get('/email-config', (req, res) => {
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSmtp   = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const smtpPass  = (process.env.SMTP_PASS || '');
  res.json({
    resend: { configured: hasResend, from: process.env.RESEND_FROM || 'onboarding@resend.dev' },
    smtp: {
      configured: hasSmtp,
      host: process.env.SMTP_HOST || null,
      port: process.env.SMTP_PORT || null,
      user: process.env.SMTP_USER || null,
      passLength: smtpPass.length,
      passNoSpacesLength: smtpPass.replace(/\s+/g, '').length,
    },
    activeMethod: hasResend ? 'resend' : hasSmtp ? 'smtp' : 'console-fallback',
  });
});


// ─── GET /api/auth/db-status ──────────────────────────────────────────────────
router.get('/db-status', async (req, res) => {
  const status = { postgres: false, mongodb: false };

  try {
    const { getPool } = require('../config/db');
    const pool = getPool();
    if (pool) { await pool.query('SELECT 1'); status.postgres = true; }
  } catch (err) { console.error('PostgreSQL health check error:', err.message); }

  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) status.mongodb = true;
  } catch (err) { console.error('MongoDB health check error:', err.message); }

  res.json({ active: status.postgres || status.mongodb, ...status });
});


module.exports = router;

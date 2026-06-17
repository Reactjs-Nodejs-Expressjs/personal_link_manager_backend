const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Admin = require('../models/Admin');       // ← MongoDB Atlas model
const auth = require('../middleware/auth');

// ─── OTP Email Sender (fixed for Gmail on cloud servers) ─────────────────────
const sendOTPEmail = async (toEmail, otp) => {
  const host    = process.env.SMTP_HOST;
  const port    = parseInt(process.env.SMTP_PORT || '587', 10);
  const user    = process.env.SMTP_USER;
  // Strip spaces — Gmail app passwords are 16 chars, shown with spaces for readability
  const pass    = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (!host || !user || !pass) {
    // ── Fallback: print to console (Render logs) ──
    console.log('\n============================');
    console.log('[OTP] SMTP not configured — code printed here:');
    console.log(`[OTP] Recipient : ${toEmail}`);
    console.log(`[OTP] Code      : ${otp}`);
    console.log(`[OTP] Expires   : 5 minutes`);
    console.log('============================\n');
    return false;
  }

  try {
    // Create a fresh transporter each send — most reliable on serverless/cloud cold starts
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,        // true for 465 (SSL), false for 587 (STARTTLS)
      requireTLS: port !== 465,    // ← CRITICAL for Gmail on cloud (forces STARTTLS upgrade)
      auth: { user, pass },
      tls: {
        rejectUnauthorized: true,  // enforce valid cert
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: `"ToolCase Admin" <${user}>`,
      to: toEmail,
      subject: '🔐 Your Admin Login OTP',
      html: `
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
      `
    });

    console.log(`[SMTP] ✅ OTP email sent successfully to ${toEmail}`);
    return true;

  } catch (err) {
    console.error(`[SMTP] ❌ Failed to send OTP to ${toEmail}`);
    console.error(`[SMTP]    Error code   : ${err.code || 'N/A'}`);
    console.error(`[SMTP]    Error message: ${err.message}`);
    console.error(`[SMTP]    Response     : ${err.response || 'N/A'}`);
    // Fallback — print code to Render logs so admin can still login
    console.log(`[OTP FALLBACK] Code for ${toEmail}: ${otp}`);
    return false;
  }
};



// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Step 1: Email submission — sends OTP (PREFERRED method)
router.post('/login', async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: 'Please enter your email address' });
    }

    // Find admin by email in MongoDB Atlas
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(400).json({ message: 'This email is not registered as an administrator.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // Persist OTP to MongoDB
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    // ✅ Respond IMMEDIATELY — don't wait for email to send
    res.json({
      otpRequired: true,
      email: admin.email,
      message: 'A 6-digit verification code was sent to your email.'
    });

    // 🔥 Send email fire-and-forget in background (doesn't block response)
    sendOTPEmail(admin.email, otp).catch(err =>
      console.error('[OTP Email] Background send failed:', err.message)
    );

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// ─── POST /api/auth/login-password ───────────────────────────────────────────
// Alternative: Direct email + password login — returns JWT immediately
router.post('/login-password', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter both email and password' });
    }

    // Find admin by email in MongoDB Atlas
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Update lastLogin
    admin.lastLogin = new Date();
    await admin.save();

    // Sign JWT
    const payload = {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'supersecretjwtkey12345_case_tool_mgmt',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          admin: {
            id: admin._id.toString(),
            email: admin.email,
            role: admin.role
          }
        });
      }
    );
  } catch (err) {
    console.error('Password login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
// Step 2: OTP verification — returns JWT
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Fetch admin from MongoDB
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Validate OTP
    if (!admin.otp || admin.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP code' });
    }

    // Check expiry
    if (new Date(admin.otpExpiry).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    // Clear OTP + set lastLogin
    admin.otp = null;
    admin.otpExpiry = null;
    admin.lastLogin = new Date();
    await admin.save();

    // Sign JWT
    const payload = {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'supersecretjwtkey12345_case_tool_mgmt',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          admin: {
            id: admin._id.toString(),
            email: admin.email,
            role: admin.role
          }
        });
      }
    );
  } catch (err) {
    console.error('Verify-OTP error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
// Verify JWT token validity
router.get('/verify', auth, (req, res) => {
  res.json({
    valid: true,
    admin: req.admin
  });
});

// ─── GET /api/auth/db-status ──────────────────────────────────────────────────
// Health check: both PostgreSQL (Neon) + MongoDB Atlas status
router.get('/db-status', async (req, res) => {
  const status = { postgres: false, mongodb: false };

  // Check PostgreSQL
  try {
    const { getPool } = require('../config/db');
    const pool = getPool();
    if (pool) {
      await pool.query('SELECT 1');
      status.postgres = true;
    }
  } catch (err) {
    console.error('PostgreSQL health check error:', err.message);
  }

  // Check MongoDB
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      status.mongodb = true;
    }
  } catch (err) {
    console.error('MongoDB health check error:', err.message);
  }

  res.json({
    active: status.postgres || status.mongodb,
    ...status
  });
});


module.exports = router;

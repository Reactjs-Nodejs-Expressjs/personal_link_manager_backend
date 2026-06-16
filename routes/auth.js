const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Admin = require('../models/Admin');       // ← MongoDB Atlas model
const auth = require('../middleware/auth');

// ─── SMTP / OTP Email Helper ─────────────────────────────────────────────────
const sendOTPEmail = async (email, otp) => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const isSMTPConfigured = host && user && pass;

  if (isSMTPConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: parseInt(port, 10) === 465,
        auth: { user, pass }
      });

      const mailOptions = {
        from: `"ToolCase Dashboard Security" <${user}>`,
        to: email,
        subject: 'Admin Security Verification OTP',
        html: `
          <div style="font-family: sans-serif; padding: 24px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Admin Login Code</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">You are attempting to verify access to the Admin Dashboard. Enter the code below to complete sign-in:</p>
            <div style="margin: 28px 0; padding: 20px; background-color: #f8fafc; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f97316; font-family: monospace;">${otp}</span>
            </div>
            <p style="color: #64748b; font-size: 11px; margin-bottom: 0;">This code will expire in <strong>5 minutes</strong>. If you did not initiate this login, please update your account password immediately.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`[SMTP] Verification email sent successfully to ${email}`);
      return true;
    } catch (error) {
      console.error(`[SMTP ERROR] Failed to send email to ${email}:`, error.message);
    }
  }

  // Fallback: print OTP to backend console
  console.log('\n============================================================');
  console.log(`[OTP SIMULATOR] EMAIL SECURITY VERIFICATION CODE`);
  console.log(`Recipient: ${email}`);
  console.log(`OTP Code : ${otp}`);
  console.log(`Expiry   : 5 minutes`);
  console.log('============================================================\n');
  return false;
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Step 1: Email submission — sends OTP
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

    // Send OTP email (or log to console)
    const wasEmailed = await sendOTPEmail(admin.email, otp);

    res.json({
      otpRequired: true,
      email: admin.email,
      message: wasEmailed
        ? 'A 6-digit verification code was sent to your email.'
        : 'Verification code generated (check the backend server logs).'
    });
  } catch (err) {
    console.error('Login error:', err.message);
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

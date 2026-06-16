const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const dbStore = require('../models/dbStore');
const auth = require('../middleware/auth');

// SMTP email delivery client with terminal simulator logging fallback
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
        auth: {
          user,
          pass
        }
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

  // Fallback console logging simulator
  console.log('\n============================================================');
  console.log(`[OTP SIMULATOR] EMAIL SECURITY VERIFICATION CODE`);
  console.log(`Recipient: ${email}`);
  console.log(`OTP Code : ${otp}`);
  console.log(`Expiry   : 5 minutes`);
  console.log('============================================================\n');
  return false;
};

// @route   POST api/auth/login
// @desc    Admin login - Step 1: Email submission (Passwordless)
// @access  Public
router.post('/login', async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: 'Please enter your email address' });
    }

    // Find admin by email
    const admin = await dbStore.admins.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: 'This email is not registered as an administrator.' });
    }

    // Generate numeric 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Save OTP verification details to admin record
    await dbStore.admins.findByIdAndUpdate(admin._id, { otp, otpExpiry });

    // Send OTP code
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

// @route   POST api/auth/verify-otp
// @desc    Admin login - Step 2: OTP verification
// @access  Public
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Fetch admin by email
    const admin = await dbStore.admins.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Validate OTP existence and match
    if (!admin.otp || admin.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP code' });
    }

    // Check expiration timestamp
    const expiryDate = new Date(admin.otpExpiry);
    if (expiryDate.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    // Clear OTP database details and update lastLogin
    await dbStore.admins.findByIdAndUpdate(admin._id, { 
      otp: null, 
      otpExpiry: null, 
      lastLogin: new Date() 
    });

    // Create JWT signing payload (24h expiry)
    const payload = {
      id: admin._id,
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
            id: admin._id,
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

// @route   GET api/auth/verify
// @desc    Verify admin token
// @access  Private
router.get('/verify', auth, (req, res) => {
  res.json({
    valid: true,
    admin: req.admin
  });
});

// @route   GET api/auth/db-status
// @desc    Get PostgreSQL database active status
// @access  Public
router.get('/db-status', async (req, res) => {
  try {
    const { getPool } = require('../config/db');
    const pool = getPool();
    if (!pool) {
      return res.json({ active: false });
    }
    // Simple query to verify DB pool is online
    await pool.query('SELECT 1');
    res.json({ active: true });
  } catch (err) {
    console.error('Database health check error:', err.message);
    res.json({ active: false });
  }
});

module.exports = router;

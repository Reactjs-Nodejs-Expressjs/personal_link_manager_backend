const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: 'admin',
      enum: ['admin', 'superadmin'],
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,       // createdAt, updatedAt auto-managed by Mongoose
    collection: 'admins',
  }
);

// Index on email for fast lookups
adminSchema.index({ email: 1 });

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;

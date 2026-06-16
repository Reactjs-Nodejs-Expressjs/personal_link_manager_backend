const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');  // ← MongoDB Atlas model

module.exports = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No authentication token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No authentication token, authorization denied' });
    }

    // Verify and decode JWT
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'supersecretjwtkey12345_case_tool_mgmt'
    );

    // Validate admin still exists in MongoDB Atlas
    const admin = await Admin.findById(decoded.id).select('-password -otp -otpExpiry');
    if (!admin) {
      return res.status(401).json({ message: 'User token is invalid, admin not found' });
    }

    // Attach admin info to request
    req.admin = {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ message: 'Token is not valid or has expired' });
  }
};

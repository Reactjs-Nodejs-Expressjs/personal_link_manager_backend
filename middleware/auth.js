const jwt = require('jsonwebtoken');
const dbStore = require('../models/dbStore');

module.exports = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No authentication token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No authentication token, authorization denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey12345_case_tool_mgmt');
    
    // Check if admin exists in database
    const admin = await dbStore.admins.findOne({ _id: decoded.id });
    if (!admin) {
      return res.status(401).json({ message: 'User token is invalid, user not found' });
    }

    // Attach user to request
    req.admin = {
      id: admin._id,
      email: admin.email,
      role: admin.role
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ message: 'Token is not valid or has expired' });
  }
};

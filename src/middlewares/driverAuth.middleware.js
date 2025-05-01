const jwt = require('jsonwebtoken');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');

exports.driverAuthMiddleware = async (req, res, next) => {
  try {
    // 1) Check if token exists
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'You are not logged in. Please log in to get access.'
      });
    }

    // 2) Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3) Check if driver exists
    const driver = await Driver.findById(decoded.id);
    if (!driver) {
      return res.status(401).json({
        success: false,
        message: 'The driver belonging to this token no longer exists.'
      });
    }

    // Grant access to protected route
    req.driver = driver;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token or authorization error'
    });
  }
};

// ... other middleware functions ...
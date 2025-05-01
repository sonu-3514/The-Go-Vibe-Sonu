const jwt = require('jsonwebtoken');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const { verifyToken } = require('../services/auth.service');

/**
 * General authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.authenticate = async (req, res, next) => {
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

    // 3) Check if user or driver exists
    let user = await User.findById(decoded.id);
    let driver = null;
    
    if (!user) {
      // If not user, try to find driver
      driver = await Driver.findById(decoded.id);
      if (!driver) {
        return res.status(401).json({
          success: false,
          message: 'The user belonging to this token no longer exists.'
        });
      }
      // Set driver in request
      req.user = driver;
      req.userType = 'driver';
    } else {
      // Set user in request
      req.user = user;
      req.userType = 'user';
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token or authorization error'
    });
  }
};

/**
 * Middleware to ensure driver authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
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

/**
 * Middleware to restrict access based on user types
 * @param {...String} userTypes - Types of users allowed (e.g., 'user', 'driver', 'admin')
 * @returns {Function} - Express middleware function
 */
exports.restrictTo = (...userTypes) => {
  return (req, res, next) => {
    if (!userTypes.includes(req.userType)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

exports.checkRegistration = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user.isRegistered) {
      return res.status(403).json({
        success: false,
        message: 'Please complete your registration to access this resource',
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
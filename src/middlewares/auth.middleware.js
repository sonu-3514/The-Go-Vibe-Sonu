const jwt = require('jsonwebtoken');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const { verifyToken } = require('../services/auth.service');
const logger = require('../utils/logger');

/**
 * General authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.authenticate = async (req, res, next) => {
  try {
    console.log('Auth Middleware: Checking authorization');
    
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('Token extracted from header');
    }

    // Check if token exists
    if (!token) {
      console.log('No token found in request');
      return res.status(401).json({
        success: false,
        message: 'You are not logged in. Please log in to get access.'
      });
    }

    // Verify token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded successfully. User ID:', decoded.id);

    // Check if user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      console.log('User not found in database. ID from token:', decoded.id);
      // Log all users in DB to help debug
      const allUsers = await User.find({}, '_id mobileNumber');
      console.log('All users in database:', allUsers);
      
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.'
      });
    }

    console.log('User found:', user._id, user.mobileNumber);
    
    // Grant access to protected route
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your token has expired! Please log in again.'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Authentication failed. Please log in again.'
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
    console.log('Driver auth middleware called');
    console.log('Auth header:', req.headers.authorization);
    
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No Bearer token found');
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    console.log('Token received:', token);
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);
    
    if (decoded.type !== 'driver') {
      console.log('Token is not for a driver');
      return res.status(403).json({
        success: false,
        message: 'Not authorized as driver'
      });
    }
    
    // Find driver in database
    const driver = await Driver.findById(decoded.id);
    console.log('Driver found:', driver ? 'Yes' : 'No');
    
    if (!driver) {
      console.log('Driver not found in database');
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Set driver in request object
    req.driver = driver;
    req.user = driver; // For backward compatibility
    next();
  } catch (error) {
    console.error('Driver auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
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

// Protected routes middleware
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
    
    try {
      // Verify token
      const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
      const decoded = jwt.verify(token, JWT_SECRET);
      
      console.log('Protect middleware decoded token:', JSON.stringify(decoded));
      
      // Check if user exists
      let user = await User.findById(decoded.id);
      
      // If not a user, check if it's a driver
      if (!user) {
        user = await Driver.findById(decoded.id);
      }
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User belonging to this token no longer exists'
        });
      }
      
      // Add user to request object
      req.user = user;
      next();
    } catch (error) {
      logger.error('JWT verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    logger.error('Error in auth middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Role-based middleware (if needed)
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user.role || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Add this debugging endpoint helper
exports.debugToken = (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    // Just decode without verification for debugging
    const decoded = jwt.decode(token);
    
    return res.status(200).json({
      success: true,
      message: 'Token decoded',
      data: {
        tokenInfo: {
          ...decoded,
          // Hide sensitive parts if any
          exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
          iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null
        },
        hasRole: !!decoded.role,
        roleValue: decoded.role,
        isDriverRole: decoded.role === 'driver'
      }
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid token format',
      error: error.message
    });
  }
};

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let entity;

    if (decoded.type === 'driver') {
      entity = await Driver.findById(decoded.id);
      if (!entity) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found',
        });
      }
      req.driver = entity;
    } else {
      entity = await User.findById(decoded.id);
      if (!entity) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }
      req.user = entity;
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: error.message,
    });
  }
};

const driverAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to drivers only',
      });
    }

    const driver = await Driver.findById(decoded.id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    if (!driver.isActive || !driver.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Driver account is not active or approved',
      });
    }

    req.driver = driver;
    next();
  } catch (error) {
    console.error('Driver auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: error.message,
    });
  }
};

// This looks good, but make sure it's actually being used in the routes
module.exports = {
  authenticate: exports.authenticate,
  driverAuthMiddleware: exports.driverAuthMiddleware,
  restrictTo: exports.restrictTo,
  checkRegistration: exports.checkRegistration,
  protect: exports.protect,
  authorize: exports.authorize,
  debugToken: exports.debugToken,
  authMiddleware: authMiddleware
};
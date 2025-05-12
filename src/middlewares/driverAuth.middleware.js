const jwt = require('jsonwebtoken');
const Driver = require('../models/driver.model');

module.exports = async (req, res, next) => {
  try {
    // Extract token
    const authHeader = req.headers.authorization;
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      // Try to get token from body or query as fallback
      token = req.body.token || req.query.token;
    }
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication failed - No token provided' 
      });
    }
    
    console.log('Token received:', token ? 'Yes' : 'No');
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decoded:', decoded ? 'Yes' : 'No', 'driverId:', decoded.id);
    
    // Find driver
    const driver = await Driver.findById(decoded.id);
    if (!driver) {
      console.log('Driver not found');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication failed - Driver not found' 
      });
    }
    
    // Set driver on request object
    req.driver = driver;
    req.user = driver; // Add this for compatibility
    console.log('Driver authenticated:', driver._id);
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed', 
      error: error.message 
    });
  }
};
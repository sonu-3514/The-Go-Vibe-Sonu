const jwt = require('jsonwebtoken');
const Admin = require('../models/admin.model'); // You'll need to create this model
const logger = require('../utils/logger');

const adminAuthMiddleware = async (req, res, next) => {
    try {
        // Check if authorization header exists
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. No token provided.'
            });
        }

        // Extract token
        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if it's an admin token
        if (!decoded.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        // Find admin by ID
        const admin = await Admin.findById(decoded.id);
        
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authentication token.'
            });
        }
        
        // Attach admin to request object
        req.admin = admin;
        next();
    } catch (error) {
        logger.error(`Authentication error: ${error}`);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

module.exports = adminAuthMiddleware;
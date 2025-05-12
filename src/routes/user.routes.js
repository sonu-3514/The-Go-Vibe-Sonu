const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const RideController = require('../controllers/ride.controller');

// FIXED: Import authMiddleware from the correct location
const { authMiddleware } = require('../middlewares/auth.middleware');

// All routes require user authentication
router.use(authMiddleware);

// Find all nearby drivers (automatically shown on login/home screen)
router.post('/nearby-drivers', UserController.getNearbyDrivers);

// Find drivers by vehicle type (when user selects a specific car type)
router.post('/drivers-by-vehicle-type', UserController.findDriversByVehicleType);

// Get available vehicle types with counts (for showing car options on home screen)
router.get('/available-vehicle-types', UserController.getAvailableVehicleTypes);

// Get active drivers
router.get('/active-drivers', UserController.getActiveDrivers);

// User profile route (if needed)
router.get('/profile', UserController.getUserProfile);

// Add this debug route
router.get('/debug-location', UserController.debugLocationQueries);

// Remove or comment out this duplicate
// router.get('/nearby-drivers', RideController.getNearbyDrivers);

module.exports = router;
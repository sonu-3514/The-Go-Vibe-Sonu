const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller');
const driverAuthController = require('../controllers/driverAuth.controller');
const { authenticate, driverAuthMiddleware } = require('../middlewares/auth.middleware');
const geofenceController = require('../controllers/geofence.controller');

// Authentication routes (no auth required)
router.post('/send-otp', driverAuthController.sendOTP);
router.post('/verify-otp', driverAuthController.verifyOTP);

// Protected routes (auth required)
router.post('/complete-registration', driverAuthMiddleware, driverAuthController.completeRegistration);
router.get('/profile', driverAuthMiddleware, driverController.getProfile);

// Vehicle routes
router.post('/vehicle', driverAuthMiddleware, driverController.addVehicle);
router.get('/vehicle', authenticate, driverController.getVehicles);
router.put('/vehicle/:id', authenticate, driverController.updateVehicle);
router.delete('/vehicle/:id', authenticate, driverController.deleteVehicle);

// Geofence and location routes
router.post('/location', driverAuthMiddleware, geofenceController.updateDriverLocation);
router.get('/nearby-geofence', driverAuthMiddleware, geofenceController.findNearbyDrivers);
router.get('/check-location', geofenceController.checkLocationStatus);
router.post('/geofence', driverAuthMiddleware, geofenceController.createGeofence);

// Driver status routes
router.put('/:id/status', authenticate, driverAuthMiddleware, driverController.updateDriverStatus);
router.get('/active', authenticate, driverController.getActiveDrivers);
router.get('/nearby', authenticate, driverController.getNearbyActiveDrivers);

module.exports = router;

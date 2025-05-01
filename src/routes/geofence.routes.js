const express = require('express');
const router = express.Router();
const geofenceController = require('../controllers/geofence.controller');
const { authenticate, driverAuthMiddleware } = require('../middlewares/auth.middleware');

// Get all geofences
router.get('/', authenticate, geofenceController.getAllGeofences);

// Get geofence by ID
router.get('/:id', authenticate, geofenceController.getGeofenceById);

// Create geofence
router.post('/', authenticate, geofenceController.createGeofence);

// Update geofence
router.put('/:id', authenticate, geofenceController.updateGeofence);

// Delete geofence - Comment out if method doesn't exist
// router.delete('/:id', authenticate, geofenceController.deleteGeofence);

// Check if a point is inside any geofence
router.post('/check', geofenceController.checkLocationStatus);

// Find nearby drivers within geofence
router.get('/nearby-drivers', authenticate, geofenceController.findNearbyDrivers);

module.exports = router;
const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller');
const driverAuthController = require('../controllers/driverAuth.controller');
const { authenticate, driverAuthMiddleware, protect, restrictTo } = require('../middlewares/auth.middleware');
const geofenceController = require('../controllers/geofence.controller');

// Authentication routes (no auth required)
router.post('/send-otp', driverAuthController.sendOTP);
router.post('/verify-otp', driverController.verifyOTP);

// Protected routes (auth required)
router.post('/complete-registration', driverAuthMiddleware, driverAuthController.completeRegistration);
router.get('/profile', driverAuthMiddleware, driverController.getProfile);

// Add these routes if they're missing
router.post('/vehicles', driverAuthMiddleware, driverController.addVehicle);
router.get('/vehicles', driverAuthMiddleware, driverController.getVehicles);
router.put('/vehicles/:id', driverAuthMiddleware, driverController.updateVehicle);
router.delete('/vehicles/:id', driverAuthMiddleware, driverController.deleteVehicle);
router.post('/vehicles/:id/select', driverAuthMiddleware, driverController.selectActiveVehicle);
// Geofence and location routes
router.post('/location', driverAuthMiddleware, geofenceController.updateDriverLocation);
router.get('/check-location', geofenceController.checkLocationStatus);
router.post('/geofence', driverAuthMiddleware, geofenceController.createGeofence);

// Driver status routes
router.put('/status', driverAuthMiddleware, driverController.updateDriverStatus);
router.get('/active', (req, res, next) => {
  // Use a custom middleware that tries driver auth first, then user auth
  driverAuthMiddleware(req, res, (driverErr) => {
    if (!driverErr) return next(); // If driver auth works, proceed
    
    // If driver auth fails, try user auth
    authenticate(req, res, next);
  });
}, driverController.getActiveDrivers);
router.get('/nearby', authenticate, driverController.getNearbyActiveDrivers);

// Add this route to your driver routes
router.post('/update-location', driverAuthMiddleware, driverController.updateLocation);

// Add these routes to your driver routes file
router.post('/toggle-status', driverAuthMiddleware, driverController.toggleOnlineStatus);
router.get('/available-rides', driverAuthMiddleware, driverController.getAvailableRides);

// Add a test endpoint to check if routes are working
router.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Driver routes are working'
  });
});

// Add an unprotected route for testing
router.post('/update-location-test', driverController.updateLocation);

// Add this debug endpoint
router.get('/debug-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }
  
  try {
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
});

// Add this debug endpoint
router.post('/debug-rides', driverController.debugRides);

// Add this route to your driver.routes.js
router.get('/refresh-rides', driverAuthMiddleware, driverController.refreshAvailableRides);

// Add this with your other routes
router.get('/debug-vehicle-matching', driverAuthMiddleware, driverController.debugVehicleMatching);

// Add to src/routes/driver.routes.js
router.get('/active-ride', driverAuthMiddleware, driverController.getActiveRide);

// Add to src/routes/driver.routes.js
router.get('/rides/history', driverAuthMiddleware, driverController.getRideHistory);

// Add to src/routes/driver.routes.js
router.get('/earnings', driverAuthMiddleware, driverController.getEarnings);

module.exports = router;
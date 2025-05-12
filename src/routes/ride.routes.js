// src/routes/ride.routes.js
const express = require('express');
const router = express.Router();
const RideController = require('../controllers/ride.controller');
const { authMiddleware, driverAuthMiddleware } = require('../middlewares/auth.middleware');

console.log('Available methods in RideController:', Object.getOwnPropertyNames(RideController));

router.use(authMiddleware);

router.post('/estimate', RideController.estimateFare);
router.post('/request', RideController.requestRide);
router.post('/accept', driverAuthMiddleware, RideController.acceptRide);
router.post('/confirm-driver', RideController.confirmDriver);
router.post('/update-status', driverAuthMiddleware, RideController.updateRideStatus); // Added driverAuthMiddleware
router.post('/cancel', RideController.cancelRide);
router.post('/retry-expired', RideController.retryExpiredRide);

router.put('/status', driverAuthMiddleware, RideController.updateRideStatus);

router.get('/user-active', RideController.getUserActiveRide);
router.get('/driver-active', driverAuthMiddleware, RideController.getDriverActiveRide);
router.get('/available', driverAuthMiddleware, RideController.getAvailableRides);
router.get('/user-history', RideController.getUserRideHistory);
router.get('/driver-history', driverAuthMiddleware, RideController.getDriverRideHistory);
router.get('/details/:id', RideController.getRideDetails);
router.get('/nearby-drivers', RideController.getNearbyDrivers);

module.exports = router;
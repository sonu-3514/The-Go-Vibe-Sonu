const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const rideController = require('../controllers/ride.controller');
const driverRoutes = require('./driver.routes');
const geofenceRoutes = require('./geofence.routes');

const router = express.Router();

// Add other route imports here

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.post('/rides/estimate', rideController.estimateFare);
router.use('/api/v1/driver/auth', driverRoutes);
router.use('/api/v1/drivers', driverRoutes);
router.use('/api/v1/geofence', geofenceRoutes);

// Mount routes
router.use('/drivers', driverRoutes);
router.use('/geofence', geofenceRoutes);
// Add other routes here

module.exports = router;
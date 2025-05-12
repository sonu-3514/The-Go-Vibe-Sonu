const express = require('express');
const router = express.Router();
const driverRoutes = require('./driver.routes');
const userRoutes = require('./user.routes');
const rideRoutes = require('./ride.routes');

// Use routes
router.use('/drivers', driverRoutes);
router.use('/users', userRoutes);
router.use('/rides', rideRoutes);

module.exports = router;
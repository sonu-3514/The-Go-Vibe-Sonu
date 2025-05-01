const express = require('express');
const router = express.Router();
const rideController = require('../controllers/ride.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.post('/', authenticate, rideController.createRideRequest);
router.get('/estimate', authenticate, rideController.estimateFare);

module.exports = router;
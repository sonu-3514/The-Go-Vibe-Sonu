const express = require('express');
const authController = require('../controllers/auth.controller');
const router = express.Router();

router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);

module.exports = router;
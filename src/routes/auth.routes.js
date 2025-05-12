const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authenticate, protect } = require('../middlewares/auth.middleware');

// Debug: List available AuthController methods
console.log("Available methods in AuthController:", Object.getOwnPropertyNames(AuthController).filter(prop => typeof AuthController[prop] === 'function'));

// Public routes (no authentication required)
router.post('/send-otp', AuthController.sendOTP);
router.post('/verify-otp', AuthController.verifyOTP);

// Protected routes (authentication required)
router.post('/complete-registration', authenticate, AuthController.completeRegistration);

router.use('/protected-route', protect, (req, res) => {
  // Protected route logic
});

module.exports = router;
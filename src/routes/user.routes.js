const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const router = express.Router();

router.use(authenticate);

router.post('/complete-registration', userController.completeRegistration);
router.get('/profile', userController.getProfile);

module.exports = router;
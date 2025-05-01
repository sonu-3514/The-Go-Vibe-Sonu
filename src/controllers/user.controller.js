const userService = require('../services/user.service');

exports.completeRegistration = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userData = req.body;

    const user = await userService.completeRegistration(userId, userData);
    
    res.status(200).json({
      success: true,
      data: user,
      message: 'Registration completed successfully',
    });
  } catch (error) {
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await userService.getUserProfile(userId);
    
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};
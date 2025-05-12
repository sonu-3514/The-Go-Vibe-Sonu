const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

/**
 * Generate JWT token
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
exports.generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token
 */
exports.verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Get user by mobile number
 * @param {string} mobileNumber - Mobile number
 * @returns {Object} User object
 */
exports.getUserByMobileNumber = async (mobileNumber) => {
  return await User.findOne({ mobileNumber });
};

/**
 * Create a new user
 * @param {string} mobileNumber - Mobile number
 * @returns {Object} New user object
 */
exports.createUser = async (mobileNumber) => {
  try {
    const newUser = new User({
      mobileNumber,
      isRegistered: false
    });
    
    await newUser.save();
    return newUser;
  } catch (error) {
    console.error(`Failed to create user: ${error.message}`);
    throw new Error(`Failed to create user: ${error.message}`);
  }
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated user
 */
exports.updateUserProfile = async (userId, updateData) => {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Update fields that are provided
    if (updateData.name) user.name = updateData.name;
    if (updateData.email) user.email = updateData.email;
    if (updateData.gender) user.gender = updateData.gender;
    if (updateData.dob) user.dob = new Date(updateData.dob);
    if (updateData.profilePhoto) user.profilePhoto = updateData.profilePhoto;
    if (updateData.hasOwnProperty('isRegistered')) user.isRegistered = updateData.isRegistered;
    
    await user.save();
    return user;
  } catch (error) {
    console.error(`Failed to update user profile: ${error.message}`);
    throw new Error(`Failed to update user profile: ${error.message}`);
  }
};
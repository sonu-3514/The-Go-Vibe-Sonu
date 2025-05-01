const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;

exports.generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

exports.getUserByMobileNumber = async (mobileNumber) => {
  return await User.findOne({ mobileNumber });
};

exports.createUser = async (mobileNumber) => {
  return await User.create({ mobileNumber });
};
const User = require('../models/user.model');

exports.completeRegistration = async (userId, userData) => {
  const { name, email, dob, gender, profilePhoto } = userData;
  
  const user = await User.findByIdAndUpdate(
    userId,
    {
      name,
      email,
      dob,
      gender,
      profilePhoto,
      isRegistered: true,
    },
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

exports.getUserProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};
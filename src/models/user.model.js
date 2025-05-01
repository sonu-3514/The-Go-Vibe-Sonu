const mongoose = require('mongoose');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  mobileNumber: {
    type: String,
    required: [true, 'Mobile number is required'],
    unique: true,
    validate: {
      validator: function (v) {
        return validator.isMobilePhone(v, 'any', { strictMode: false });
      },
      message: 'Please provide a valid mobile number',
    },
  },
  name: {
    type: String,
    required: function () {
      return this.isRegistered;
    },
    trim: true,
  },
  email: {
    type: String,
    required: function () {
      return this.isRegistered;
    },
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  dob: {
    type: Date,
    required: function () {
      return this.isRegistered;
    },
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: function () {
      return this.isRegistered;
    },
  },
  profilePhoto: {
    type: String,
    default: '',
  },
  isRegistered: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.index({ mobileNumber: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

// Fix: Export the User model directly instead of requiring itself
module.exports = User;
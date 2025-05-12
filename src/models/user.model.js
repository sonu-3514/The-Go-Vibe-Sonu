const mongoose = require('mongoose');
const validator = require('validator');

const userSchema = new mongoose.Schema({

  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    required: true
},
  name: {
    type: String,
    trim: true,
  },
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: null,
  },
  dob: {
    type: Date,
    default: null,
  },
  profilePhoto: {
    type: String,
    default: null,
  },
  otp: {
    type: String,
  },
  otpExpiry: {
    type: Date,
  },
  isRegistered: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }},{ timestamps: true });


// Make email sparse and unique

// Create a sparse unique index on phone

module.exports = mongoose.model('User', userSchema);
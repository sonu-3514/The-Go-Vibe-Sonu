/**
 * Generate a random numeric OTP of specified length
 * @param {number} length - Length of OTP
 * @returns {string} Generated OTP
 */
exports.generateOTP = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
};

exports.filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

/**
 * Check if running in development mode
 * @returns {boolean}
 */
exports.isDevMode = () => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the string
 * @returns {string}
 */
exports.generateRandomString = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Check if we should use real SMS
 * Force SMS sending
 */
exports.shouldUseSMS = () => {
  return true; // Always return true to force SMS
};
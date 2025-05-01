const twilio = require('twilio');
const { isDevMode } = require('./helpers');

/**
 * Send SMS using Twilio
 * @param {string} to - Phone number to send to
 * @param {string} body - Message content
 */
exports.sendSMS = async (to, body) => {
  try {
    // Check for Twilio credentials
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials are not configured');
    }

    // Create Twilio client
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    // Send message
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to
    });
    
    console.log(`SMS sent successfully, SID: ${message.sid}`);
    return message;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
};

/**
 * Send OTP via SMS
 * @param {string} phoneNumber - Phone number to send to
 * @param {string} otp - OTP code
 */
exports.sendOTP = async (phoneNumber, otp) => {
  try {
    const message = `Your Go-Vibe verification code is: ${otp}`;
    
    // In development, we can still log the OTP
    if (isDevMode()) {
      console.log(`[DEV] Would send to ${phoneNumber}: ${message}`);
      
      // In development, we might want to skip actual SMS sending to save API calls
      if (process.env.SKIP_SMS_IN_DEV === 'true') {
        return { 
          success: true, 
          mock: true,
          sid: 'DEV-MODE'
        };
      }
    }
    
    // Send actual SMS
    return await exports.sendSMS(phoneNumber, message);
  } catch (error) {
    console.error(`Failed to send OTP to ${phoneNumber}:`, error);
    throw error;
  }
};
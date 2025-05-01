const OTP = require('../models/OTP');
const { client, twilioPhoneNumber } = require('../config/twilio');
const { generateOTP } = require('../utils/helpers');

exports.sendOTP = async (mobileNumber) => {
  // Generate a 6-digit OTP
  const otp = generateOTP(6);
  
  // Save OTP to database
  await OTP.create({ mobileNumber, otp });

  // Send OTP via Twilio
  try {
    await client.messages.create({
      body: `Your OTP for Uber/Rapido app is: ${otp}`,
      from: twilioPhoneNumber,
      to: mobileNumber,
    });
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw new Error('Failed to send OTP');
  }
};

exports.verifyOTP = async (mobileNumber, otp) => {
    const otpRecord = await OTP.findOne({ mobileNumber, otp });
    
    if (!otpRecord) {
      throw new Error('Invalid OTP');
    }
  
    // Get current time in IST
    const now = new Date();
    
    // Debug logs (temporary)
    console.log('Current time:', now);
    console.log('OTP expiry time:', otpRecord.expiresAt);
    console.log('Time difference (ms):', now - otpRecord.expiresAt);
  
    // More lenient expiry check (5 minute buffer)
    if (otpRecord.expiresAt < new Date(now - (5 * 60 * 1000))) {
      throw new Error('OTP has expired');
    }
  
    await OTP.deleteOne({ _id: otpRecord._id });
    return { success: true, message: 'OTP verified successfully' };
  };
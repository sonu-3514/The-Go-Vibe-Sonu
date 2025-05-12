const OTP = require('../models/otp.model');
const twilio = require('twilio');
const client = process.env.TWILIO_SID ? twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN) : null;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const isConfigured = client && twilioPhoneNumber;

const generateOTP = (length) => {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
};
/**
 * Send OTP to mobile number
 * @param {string} mobileNumber - User mobile number
 * @returns {Object} Result of the operation
 */exports.sendOTP = async (phone) => {
  try {
    const otp = generateOTP(6);
    console.log(`Generated OTP for ${phone}: ${otp}`);
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await OTP.deleteMany({ phone });
    await OTP.create({ phone, otp, expiresAt });
    
    let response = {
        success: true,
        message: 'OTP generated successfully'
    };
    
    if (process.env.NODE_ENV === 'development') {
        console.log(`Development mode. OTP: ${otp}`);
        response.otp = otp;
        return response;
    }
    
    if (isConfigured && client) {
        try {
            const message = await client.messages.create({
                body: `Your OTP for Go Vibe app is: ${otp}`,
                from: twilioPhoneNumber,
                to: phone,
            });
            console.log(`OTP sent via SMS to ${phone}`);
            return response;
        } catch (twilioError) {
            console.error('Twilio error:', twilioError);
            response.otp = otp;
            response.error = twilioError.message;
            return response;
        }
    } else {
        console.log('Twilio not configured, returning OTP in response');
        response.otp = otp;
        return response;
    }
} catch (error) {
    console.error('Error in sendOTP service:', error);
    throw new Error(`Failed to send OTP: ${error.message}`);
}
};

/**
 * Verify OTP for mobile number
 * @param {string} phone - User phone number
 * @param {string} otp - OTP to verify
 * @returns {Object} Result of the operation
 */exports.verifyOTP = async (phone, otp) => {
  try {
    console.log(`Verifying OTP for ${phone}: ${otp}`);
    const otpRecord = await OTP.findOne({ phone, otp });
    
    if (!otpRecord) {
        console.warn(`No OTP record found for ${phone} with code ${otp}`);
        throw new Error('Invalid OTP');
    }
    
    const now = new Date();
    if (now > otpRecord.expiresAt) {
        console.warn(`OTP has expired for ${phone}`);
        throw new Error('OTP has expired');
    }
    
    await OTP.deleteMany({ phone });
    console.log(`OTP verified successfully for ${phone}`);
    return { success: true, message: 'OTP verified successfully' };
} catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
}
};
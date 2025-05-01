// driverAuth.controller.js
const jwt = require('jsonwebtoken');
const driverOtpService = require('../services/driverOtp.service');
const driverService = require('../services/driver.service');

/**
 * Send OTP for driver authentication
 */
exports.sendOTP = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            console.log('Phone number missing in request');
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        console.log(`Attempting to send OTP to ${phone}`);
        
        // Call the sendOTP service to send OTP
        const response = await driverOtpService.sendOTP(phone);
        console.log('OTP service response:', response);

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error in sendOTP controller:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to send OTP'
        });
    }
};

/**
 * Verify OTP and generate token
 */
exports.verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        
        console.log(`Verifying OTP for phone: ${phone}`);

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required'
            });
        }

        // Call service to verify OTP
        const result = await driverOtpService.verifyOTP(phone, otp);

        if (!result.success) {
            return res.status(400).json(result);
        }

        // Create and sign JWT token
        const token = jwt.sign(
            { id: result.driver._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
        );

        // Return success with token and registration status
        return res.status(200).json({
            success: true,
            token,
            isRegistered: result.driver.isRegistered || false,
            message: 'OTP verified successfully'
        });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify OTP'
        });
    }
};

/**
 * Complete driver registration
 */
exports.completeRegistration = async (req, res) => {
    try {
        const driverId = req.driver.id;
        const driverData = req.body;

        // Call the service to complete registration
        const updatedDriver = await driverService.completeRegistration(driverId, driverData);

        return res.status(200).json({
            success: true,
            isRegistered: true,
            data: updatedDriver,
            message: 'Registration completed successfully'
        });
    } catch (error) {
        console.error('Error completing registration:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to complete registration'
        });
    }
};

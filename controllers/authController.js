const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
    });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { name, email, password, role } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists' });
        }

        // Only allow customer role via public registration
        const allowedRole = ['customer'].includes(role) ? role : 'customer';

        const user = await User.create({ name, email, password, role: allowedRole });

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

        user.verificationToken = verificationTokenHash;
        await user.save();

        const token = generateToken(user._id);
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientUrl}/verify-email/${verificationToken}`;

        // Send welcome & verification email
        try {
            await sendEmail({
                email: user.email,
                subject: 'Verify your email - SupportDesk',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 16px;">
                        <div style="text-align: center; margin-bottom: 32px;">
                            <h1 style="color: #6366f1; font-size: 28px; margin: 0;">Welcome to SupportDesk!</h1>
                        </div>
                        <p style="color: #94a3b8; font-size: 16px;">Hi <strong style="color: #f8fafc;">${user.name}</strong>,</p>
                        <p style="color: #94a3b8;">Your account has been created successfully. Please verify your email address to get full access to the portal.</p>
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${verifyUrl}" style="background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                                Verify Email Address
                            </a>
                        </div>
                        <div style="background: #1e293b; padding: 16px; border-radius: 10px; margin: 24px 0;">
                            <p style="margin: 0; color: #64748b; font-size: 13px;">Or copy this link: <a href="${verifyUrl}" style="color: #6366f1;">${verifyUrl}</a></p>
                        </div>
                        <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 32px;">This is an automated email from SupportDesk. Please do not reply.</p>
                    </div>
                `,
            });
        } catch (emailErr) {
            console.error('Welcome email failed:', emailErr.message);
        }

        res.status(201).json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                isVerified: user.isVerified,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user and include password
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ success: false, message: 'Account is deactivated. Please contact support.' });
        }

        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                department: user.department,
                isVerified: user.isVerified,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ success: true, user });
    } catch (error) {
        next(error);
    }
};

// @desc    Update profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
    try {
        const { name, department } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { name, department },
            { new: true, runValidators: true }
        );
        res.json({ success: true, user });
    } catch (error) {
        next(error);
    }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user._id).select('+password');

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Please provide your email address' });
        }

        const user = await User.findOne({ email });

        // Always respond the same way to prevent email enumeration attacks
        const genericResponse = {
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.',
        };

        if (!user) {
            return res.json(genericResponse);
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.passwordResetToken = resetTokenHash;
        user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
        await user.save({ validateBeforeSave: false });

        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const resetUrl = `${clientUrl}/reset-password/${resetToken}`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'SupportDesk — Password Reset Request',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 16px;">
                        <div style="text-align: center; margin-bottom: 32px;">
                            <h1 style="color: #6366f1; font-size: 24px; margin: 0;">Password Reset</h1>
                        </div>
                        <p style="color: #94a3b8; font-size: 16px;">Hi <strong style="color: #f8fafc;">${user.name}</strong>,</p>
                        <p style="color: #94a3b8;">We received a request to reset your SupportDesk account password. Click the button below to set a new password.</p>
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                                Reset Password
                            </a>
                        </div>
                        <div style="background: #1e293b; padding: 16px; border-radius: 10px; margin: 24px 0;">
                            <p style="margin: 0; color: #64748b; font-size: 13px;">Or copy this link: <a href="${resetUrl}" style="color: #6366f1;">${resetUrl}</a></p>
                        </div>
                        <p style="color: #ef4444; font-size: 13px;">⚠️ This link expires in <strong>30 minutes</strong>. If you did not request this, please ignore this email — your password will remain unchanged.</p>
                        <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 32px;">SupportDesk Security Team</p>
                    </div>
                `,
            });
        } catch (emailErr) {
            console.error('📧 Forgot Password Email Error:', emailErr);
            
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });

            let errorMessage = 'Email could not be sent. Please try again.';
            if (emailErr.code === 'EAUTH') {
                errorMessage = 'Email authentication failed. Please check your SMTP settings or Gmail App Password.';
            }

            return res.status(500).json({ 
                success: false, 
                message: errorMessage,
                ...(process.env.NODE_ENV === 'development' && { error: emailErr.message })
            });
        }

        res.json(genericResponse);
    } catch (error) {
        next(error);
    }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Hash the token from the URL to compare to stored hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: tokenHash,
            passwordResetExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Password reset link is invalid or has expired' });
        }

        // Set new password and clear reset fields
        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        // Send confirmation email
        try {
            await sendEmail({
                email: user.email,
                subject: 'SupportDesk — Password Changed Successfully',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 16px;">
                        <h1 style="color: #10b981; font-size: 24px;">Password Changed ✓</h1>
                        <p style="color: #94a3b8;">Hi <strong style="color: #f8fafc;">${user.name}</strong>,</p>
                        <p style="color: #94a3b8;">Your SupportDesk password has been changed successfully.</p>
                        <p style="color: #ef4444; font-size: 13px;">If you did not make this change, please contact us immediately.</p>
                    </div>
                `,
            });
        } catch (e) { /* ignore email errors on confirmation */ }

        const jwtToken = generateToken(user._id);
        res.json({
            success: true,
            message: 'Password reset successful. You are now logged in.',
            token: jwtToken,
            user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify email address
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.params;
        const verificationTokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            verificationToken: verificationTokenHash,
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = { register, login, getMe, updateProfile, changePassword, forgotPassword, resetPassword, verifyEmail };

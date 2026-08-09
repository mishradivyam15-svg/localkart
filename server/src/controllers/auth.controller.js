const User = require('../models/User');
const Farmer = require('../models/Farmer');
const DeliveryAgent = require('../models/DeliveryAgent');
const { asyncHandler, sendEmail } = require('../utils/helpers');
const crypto = require('crypto');

// @desc    Register user
// @route   POST /api/v1/auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email, role });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: `${role} already registered with this email`
    });
  }

  let user;

  try {
    // Create user
    user = await User.create({
      name,
      email,
      password,
      phone,
      role: role || "customer",
    });

    // Generate OTP
    const otp = user.generateOTP();
    await user.save();

    // Send OTP mail
    await sendEmail({
      to: email,
      subject: "Farm2Door - Verify Your Email",
      html: `<h2>Your OTP is: ${otp}</h2><p>Valid for 10 minutes.</p>`,
    });

  } catch (error) {
    // If mail fails, delete user
    if (user) {
      await User.findByIdAndDelete(user._id);
    }

    throw new Error("Registration failed: " + error.message);
  }
  // If farmer, create farmer profile (rollback user if this fails)
  if (role === 'farmer') {
  try {
    console.log("STEP 3: entering farmer creation");

    const farmer = await Farmer.create({
      userId: user._id,
      farmName: `${name}'s Farm`,
      location: {
        type: 'Point',
        coordinates: [77.5946, 12.9716]
      }
    });

    console.log("STEP 4: farmer created:", farmer);

  } catch (profileError) {
    console.error("FARMER CREATE ERROR:", profileError);

    await User.findByIdAndDelete(user._id);

    return res.status(500).json({
      success: false,
      message: 'Failed to create farmer profile. Please try again.'
    });
  }
}
  // If delivery agent, create profile (rollback user if this fails)
  if (role === 'delivery') {
    try {
      await DeliveryAgent.create({ userId: user._id });
    } catch (profileError) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ success: false, message: 'Failed to create delivery profile. Please try again.' });
    }
  }

  res.status(201).json({
    success: true,
    message: 'OTP sent to email. Please verify.',
    userId: user._id,
    email: user.email
  });
});

// @desc    Login user
// @route   POST /api/v1/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Admin login check using .env credentials
  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    let adminUser = await User.findOne({ email });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Admin',
        email,
        password,
        role: 'admin',
        isVerified: true,
      });
    }
    return sendTokenResponse(adminUser, 200, res);
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been suspended' });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  // Block login if email is not verified
  if (!user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before logging in',
      needsVerification: true,
      email: user.email
    });
  }

  sendTokenResponse(user, 200, res);
});

// @desc    Verify OTP
// @route   POST /api/v1/auth/verify-otp
exports.verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (!user.otp || !user.otp.code || user.otp.expiresAt < Date.now()) {
    return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
  }

  if (user.otp.code !== otp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }

  user.isVerified = true;
  user.otp = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(404).json({ success: false, message: 'No user found with this email' });
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

  await sendEmail({
    to: user.email,
    subject: 'Farm2Door - Password Reset',
    html: `<h2>Reset Your Password</h2><p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 10 minutes.</p>`
  });

  res.json({ success: true, message: 'Password reset email sent', resetToken });
});

// @desc    Reset password
// @route   POST /api/v1/auth/reset-password/:token
exports.resetPassword = asyncHandler(async (req, res) => {
  const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Get current user
// @route   GET /api/v1/auth/me
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('wishlist');

  let farmerProfile = null;
  if (user.role === 'farmer') {
    farmerProfile = await Farmer.findOne({ userId: user._id });
  }

  let deliveryProfile = null;
  if (user.role === 'delivery') {
    deliveryProfile = await DeliveryAgent.findOne({ userId: user._id });
  }

  res.json({
    success: true,
    data: {
      user,
      farmerProfile,
      deliveryProfile
    }
  });
});

// @desc    Update profile
// @route   PUT /api/v1/auth/update-profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, avatar } = req.body;
  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (avatar) updateData.avatar = avatar;

  const user = await User.findByIdAndUpdate(req.user.id, updateData, {
    new: true,
    runValidators: true
  });

  res.json({ success: true, data: user });
});

// @desc    Update password
// @route   PUT /api/v1/auth/update-password
exports.updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Validate both fields are present
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Please provide both current and new password' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) return res.status(401).json({ success: false, message: 'Incorrect current password' });

  user.password = newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Logout
// @route   POST /api/v1/auth/logout
exports.logout = asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

// @desc    Resend OTP
// @route   POST /api/v1/auth/resend-otp
exports.resendOTP = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const otp = user.generateOTP();
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Farm2Door - New OTP',
    html: `<h2>Your new OTP is: ${otp}</h2>`
  });

  res.json({ success: true, message: 'OTP sent', ...(process.env.NODE_ENV !== 'production' && { otp }) });
});

// Helper: Send token response (exported for reuse by face auth)
const sendTokenResponse = exports.sendTokenResponse = (user, statusCode, res, otp = null) => {
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(Date.now() + (parseInt(process.env.JWT_COOKIE_EXPIRE) || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  };

  const responseData = {
    success: true,
    token,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      avatar: user.avatar
    }
  };

  if (otp && process.env.NODE_ENV !== 'production') {
    responseData.otp = otp; // Include OTP in dev for testing
  }

  res.status(statusCode).cookie('token', token, options).json(responseData);
};

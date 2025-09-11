const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const User = require("../models/User");

// Register admin
const registerAdmin = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { username, password } = req.body;

    // Trim and validate inputs
    const trimmedUsername = username?.trim();
    const trimmedPassword = password?.trim();

    if (!trimmedUsername || !trimmedPassword) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Check if admin already exists
    const userExist = await User.findOne({ username: trimmedUsername }).session(
      session
    );
    if (userExist) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Username already taken",
      });
    }

    // Create admin
    const newUser = await User.create(
      [
        {
          username: trimmedUsername,
          password: trimmedPassword, // will be hashed by pre-save hook
        },
      ],
      { session }
    );

    // JWT token
    const token = JWT.sign({ userId: newUser[0]._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

    await session.commitTransaction();
    session.endSession();

    const userResponse = newUser[0].toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      data: { user: userResponse, token },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error from registerAdmin:", error);
    next(error);
  }
};

// Login admin
const loginAdmin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Trim and validate inputs
    const trimmedUsername = username?.trim();
    const trimmedPassword = password?.trim();

    if (!trimmedUsername || !trimmedPassword) {
      return res.status(401).json({
        success: false,
        message: "Username and password required",
      });
    }

    // Find user with password
    const user = await User.findOne({ username: trimmedUsername }).select(
      "+password"
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(trimmedPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate token
    const token = JWT.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: { token },
    });
  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
};

module.exports = { registerAdmin, loginAdmin };

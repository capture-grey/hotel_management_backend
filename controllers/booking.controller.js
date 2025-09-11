const mongoose = require("mongoose");
const Room = require("../models/Room");
const Booking = require("../models/Booking");

// Create a new booking
const createBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { roomId, guestName, nights, checkInDate } = req.body;

    if (!roomId || !guestName || !nights || !checkInDate) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Room ID, guest name, nights, and check-in date are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid room ID format",
      });
    }

    if (nights < 1) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "At least 1 night must be booked",
      });
    }

    const checkIn = new Date(checkInDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // ignore time

    if (checkIn < today) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Check-in date cannot be in the past",
      });
    }

    await session.startTransaction();

    const room = await Room.findById(roomId).session(session);
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    if (!room.available) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Room is not available" });
    }

    const booking = await Booking.create(
      [
        {
          roomId,
          guestName: guestName.trim(),
          nights,
          checkInDate: checkIn,
        },
      ],
      { session }
    );

    room.available = false;
    await room.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populatedBooking = await Booking.findById(booking[0]._id).populate(
      "roomId",
      "roomNo type beds pricePerNight"
    );

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: populatedBooking,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)
          .map((err) => err.message)
          .join(", "),
      });
    }

    next(error);
  }
};

// Get all bookings with pagination
const getBookings = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    await session.startTransaction();

    const bookings = await Booking.find()
      .populate("roomId", "roomNo type beds pricePerNight")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .session(session);

    const total = await Booking.countDocuments().session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Get booking by ID
const getBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid booking ID format" });
    }

    await session.startTransaction();

    const booking = await Booking.findById(id)
      .populate("roomId", "roomNo type beds pricePerNight")
      .session(session);

    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Update booking
const updateBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const { guestName, nights, checkInDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid booking ID format" });
    }

    if (!guestName && !nights && !checkInDate) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "At least one field (guestName, nights, or checkInDate) must be provided",
      });
    }

    if (nights && nights < 1) {
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "At least 1 night must be booked" });
    }

    if (checkInDate) {
      const checkIn = new Date(checkInDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // ignore time
      if (checkIn < today) {
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Check-in date cannot be in the past",
        });
      }
    }

    await session.startTransaction();

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    if (guestName !== undefined) booking.guestName = guestName.trim();
    if (nights !== undefined) booking.nights = nights;
    if (checkInDate !== undefined) booking.checkInDate = new Date(checkInDate);

    await booking.save({ session });
    await session.commitTransaction();
    session.endSession();

    const populatedBooking = await Booking.findById(id).populate(
      "roomId",
      "roomNo type beds pricePerNight"
    );

    res.status(200).json({
      success: true,
      message: "Booking updated successfully",
      data: populatedBooking,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)
          .map((err) => err.message)
          .join(", "),
      });
    }

    next(error);
  }
};

// Delete booking
const deleteBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid booking ID format" });
    }

    await session.startTransaction();

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    await Room.findByIdAndUpdate(
      booking.roomId,
      { available: true },
      { session }
    );
    await Booking.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res
      .status(200)
      .json({ success: true, message: "Booking deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Get booking summary (aggregated)
const getBookingSummary = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const summary = await Booking.aggregate([
      {
        $lookup: {
          from: "rooms",
          localField: "roomId",
          foreignField: "_id",
          as: "room",
        },
      },
      { $unwind: "$room" },
      {
        $group: {
          _id: "$roomId",
          roomNo: { $first: "$room.roomNo" },
          type: { $first: "$room.type" },
          totalNightsBooked: { $sum: "$nights" },
          totalBookings: { $sum: 1 },
          totalRevenue: {
            $sum: { $multiply: ["$nights", "$room.pricePerNight"] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          roomId: "$_id",
          roomNo: 1,
          type: 1,
          totalNightsBooked: 1,
          totalBookings: 1,
          totalRevenue: 1,
        },
      },
      { $sort: { roomNo: 1 } },
    ]).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBooking,
  updateBooking,
  deleteBooking,
  getBookingSummary,
};

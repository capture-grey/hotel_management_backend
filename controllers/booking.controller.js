const mongoose = require("mongoose");
const Room = require("../models/Room");
const Booking = require("../models/Booking");
const BookingHistory = require("../models/BookingHistory");

// Create a new booking
const createBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { roomId, guestName, nights } = req.body;

    if (!roomId || !guestName || !nights) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Room ID, guest name, and nights are required",
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

    // Always set check-in date to today
    const today = new Date();
    today.setHours(0, 0, 0, 0); // ignore time
    const checkIn = today;

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

// Update booking
const updateBooking = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const { guestName, nights } = req.body; // no checkInDate from client

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid booking ID format" });
    }

    if (!guestName && !nights) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "At least one field (guestName or nights) must be provided",
      });
    }

    if (nights && nights < 1) {
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "At least 1 night must be booked" });
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

    // Update only allowed fields
    if (guestName !== undefined) booking.guestName = guestName.trim();
    if (nights !== undefined) booking.nights = nights;

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

// Checkout booking - Move to history and free up the room
const checkoutBooking = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    // No request body expected - always use current date for checkout
    console.log(`Checkout request for booking ID: ${id}`);
    console.log(`Using current date for checkout`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID format",
      });
    }

    await session.startTransaction();
    console.log("Transaction started");

    // Get the booking with room details
    const booking = await Booking.findById(id)
      .populate("roomId", "roomNo type pricePerNight")
      .session(session);

    console.log("Booking found:", booking ? booking._id : "Not found");

    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const room = booking.roomId;
    console.log("Room details:", room);

    // Calculate actual stay duration using current date
    const plannedCheckOutDate = new Date(booking.checkInDate);
    plannedCheckOutDate.setDate(plannedCheckOutDate.getDate() + booking.nights);

    const checkOutDate = new Date(); // Always use current date/time
    const actualNightsStayed = Math.max(
      1,
      Math.ceil((checkOutDate - booking.checkInDate) / (1000 * 60 * 60 * 24))
    );

    console.log(
      `Planned nights: ${booking.nights}, Actual nights: ${actualNightsStayed}`
    );

    // Calculate amounts
    const plannedTotalAmount = booking.nights * room.pricePerNight;
    const actualTotalAmount = actualNightsStayed * room.pricePerNight;

    // Determine status based on stay duration
    let status = "completed";
    if (actualNightsStayed < booking.nights) {
      status = "early_checkout";
    } else if (actualNightsStayed > booking.nights) {
      status = "extended_stay";
    }

    console.log(
      `Status: ${status}, Planned amount: ${plannedTotalAmount}, Actual amount: ${actualTotalAmount}`
    );

    // Create history record
    const historyRecord = await BookingHistory.create(
      [
        {
          roomId: room._id,
          guestName: booking.guestName,
          roomNo: room.roomNo,
          roomType: room.type,
          checkInDate: booking.checkInDate,
          checkOutDate: checkOutDate,
          nights: booking.nights,
          pricePerNight: room.pricePerNight,
          totalAmount: plannedTotalAmount,
          actualNightsStayed: actualNightsStayed,
          actualTotalAmount: actualTotalAmount,
          status: status,
        },
      ],
      { session }
    );

    console.log("History record created:", historyRecord[0]._id);

    // Make room available again
    await Room.findByIdAndUpdate(room._id, { available: true }, { session });

    console.log("Room marked as available:", room._id);

    // Remove from active bookings
    await Booking.findByIdAndDelete(id).session(session);
    console.log("Booking deleted:", id);

    await session.commitTransaction();
    session.endSession();
    console.log("Transaction committed successfully");

    res.status(200).json({
      success: true,
      message: "Booking checked out successfully",
      data: {
        history: historyRecord[0],
        billing: {
          plannedNights: booking.nights,
          plannedAmount: plannedTotalAmount,
          actualNights: actualNightsStayed,
          actualAmount: actualTotalAmount,
          status: status,
          roomNo: room.roomNo,
          guestName: booking.guestName,
        },
      },
    });
  } catch (error) {
    console.error("Checkout error details:", error);

    if (session.inTransaction()) {
      await session.abortTransaction();
      console.log("Transaction aborted");
    }

    session.endSession();

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)
          .map((err) => err.message)
          .join(", "),
      });
    }

    // More specific error handling
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Check for specific MongoDB transaction errors
    if (
      error.errorLabels &&
      error.errorLabels.includes("TransientTransactionError")
    ) {
      return res.status(500).json({
        success: false,
        message: "Transaction error. Please try again.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error during checkout",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  createBooking,
  getBookings,
  updateBooking,
  deleteBooking,
  checkoutBooking,
};

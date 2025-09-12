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

    // Check if room is already booked (using both available flag and currentBooking)
    if (!room.available || room.currentBooking) {
      await session.abortTransaction();
      session.endSession();

      let bookingDetails = null;
      if (room.currentBooking) {
        bookingDetails = await Booking.findById(room.currentBooking);
      }

      return res.status(400).json({
        success: false,
        message: "Room is already booked",
        requiresAction: true,
        bookingDetails: bookingDetails,
        options: [
          {
            action: "checkout",
            label: "Checkout current guest",
            description: "Force checkout existing booking",
          },
          {
            action: "cancel",
            label: "Cancel",
            description: "Do not create new booking",
          },
        ],
      });
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

    // Update room status and set current booking reference
    room.available = false;
    room.currentBooking = booking[0]._id;
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
    next(error);
  }
};

// Get single booking by ID
const getBooking = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID format",
      });
    }

    await session.startTransaction();

    const booking = await Booking.findById(id)
      .populate("roomId", "roomNo type beds pricePerNight available")
      .session(session);

    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // More specific error handling
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
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

    // Remove currentBooking reference from Room and mark as available
    const roomUpdateResult = await Room.findByIdAndUpdate(
      booking.roomId,
      {
        available: true,
        currentBooking: null,
      },
      { session, new: false } // Return the original document
    );

    // Verify room was found and updated
    if (!roomUpdateResult) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Associated room not found",
      });
    }

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

// Checkout booking
const checkoutBooking = async (req, res, next) => {
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

    const room = booking.roomId;

    // Additional check to ensure room exists
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Associated room not found",
      });
    }

    const checkOutDate = new Date();
    const actualNightsStayed = Math.max(
      1,
      Math.ceil((checkOutDate - booking.checkInDate) / (1000 * 60 * 60 * 24))
    );

    const totalAmount = actualNightsStayed * room.pricePerNight;

    // Determine status based on stay duration
    let status = "completed";
    if (actualNightsStayed < booking.nights) {
      status = "early_checkout";
    } else if (actualNightsStayed > booking.nights) {
      status = "extended_stay";
    }

    // Save history
    const historyRecord = await BookingHistory.create(
      [
        {
          roomId: room._id,
          guestName: booking.guestName,
          roomNo: room.roomNo,
          roomType: room.type,
          checkInDate: booking.checkInDate,
          checkOutDate,
          nights: booking.nights,
          pricePerNight: room.pricePerNight,
          totalAmount: booking.nights * room.pricePerNight, // Planned amount
          actualNightsStayed,
          actualTotalAmount: totalAmount, // Actual amount charged
          status: status,
        },
      ],
      { session }
    );

    // Free room and remove currentBooking reference
    const roomUpdateResult = await Room.findByIdAndUpdate(
      room._id,
      {
        available: true,
        currentBooking: null,
      },
      { session, new: false } // Return the original document
    );

    // Verify room was updated
    if (!roomUpdateResult) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Room not found for update",
      });
    }

    // Remove booking
    await Booking.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Booking checked out successfully",
      data: {
        history: historyRecord[0],
        billing: {
          plannedNights: booking.nights,
          plannedAmount: booking.nights * room.pricePerNight,
          actualNights: actualNightsStayed,
          actualAmount: totalAmount,
          status: status,
          roomNo: room.roomNo,
          guestName: booking.guestName,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Enhanced error handling
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    next(error);
  }
};

module.exports = {
  createBooking,
  getBooking,
  getBookings,
  updateBooking,
  deleteBooking,
  checkoutBooking,
};

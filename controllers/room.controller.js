const mongoose = require("mongoose");
const Room = require("../models/Room");
const Booking = require("../models/Booking");

// Get all rooms with pagination
const getRooms = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.available) filter.available = req.query.available === "true";
    if (req.query.minBeds) filter.beds = { $gte: parseInt(req.query.minBeds) };
    if (req.query.maxPrice)
      filter.pricePerNight = { $lte: parseFloat(req.query.maxPrice) };

    await session.startTransaction();

    const rooms = await Room.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ roomNo: 1 })
      .session(session);

    const total = await Room.countDocuments(filter).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: rooms,
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

// Get single room by ID
const getRoom = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid room ID format",
      });
    }

    await session.startTransaction();

    const room = await Room.findById(id).session(session);

    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Create a new room
const createRoom = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { roomNo, type, beds, pricePerNight, description, available } =
      req.body;

    // Validation
    if (!roomNo || !type || !beds || !pricePerNight) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Room number, type, beds, and price per night are required",
      });
    }

    await session.startTransaction();

    // Check if room number already exists
    const existingRoom = await Room.findOne({ roomNo }).session(session);
    if (existingRoom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message: "Room number already exists",
      });
    }

    const room = await Room.create(
      [
        {
          roomNo,
          type,
          beds,
          pricePerNight,
          description: description || "",
          available: available !== undefined ? available : true,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: room[0],
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Update a room
const updateRoom = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const {
      roomNo,
      type,
      beds,
      pricePerNight,
      description,
      available,
      forceUpdate,
      checkoutBooking: shouldCheckout,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid room ID format",
      });
    }

    await session.startTransaction();

    // Check if room exists
    const room = await Room.findById(id).session(session);
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Check if new room number conflicts with existing room
    if (roomNo && roomNo !== room.roomNo) {
      const existingRoom = await Room.findOne({ roomNo }).session(session);
      if (existingRoom) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          success: false,
          message: "Room number already exists",
        });
      }
    }

    // Check if trying to make room available while it has active bookings
    if (available === true && room.available === false) {
      const activeBookings = await Booking.findOne({
        roomId: id,
        checkInDate: { $lte: new Date() },
        $expr: {
          $lt: [
            "$nights",
            {
              $ceil: {
                $divide: [
                  { $subtract: [new Date(), "$checkInDate"] },
                  1000 * 60 * 60 * 24,
                ],
              },
            },
          ],
        },
      })
        .populate("guestName", "name")
        .session(session);

      if (activeBookings && !forceUpdate) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          success: false,
          message: "Room has active bookings",
          data: {
            requiresAction: true,
            bookingDetails: {
              guestName: activeBookings.guestName,
              bookingId: activeBookings._id,
              checkInDate: activeBookings.checkInDate,
              nights: activeBookings.nights,
            },
            options: [
              {
                action: "checkout",
                label: "Checkout current booking",
                description: `Checkout guest ${activeBookings.guestName} and free up the room`,
              },
              {
                action: "delete",
                label: "Delete booking",
                description: `Delete the booking for guest ${activeBookings.guestName}`,
              },
            ],
          },
        });
      }

      // If forceUpdate is true and we have a specific action to take
      if (activeBookings && forceUpdate) {
        if (shouldCheckout === true) {
          // Checkout the booking
          await checkoutBookingInternal(activeBookings._id, session);
        } else {
          // Delete the booking
          await deleteBookingInternal(activeBookings._id, session);
        }
      }
    }

    // Update fields
    if (roomNo !== undefined) room.roomNo = roomNo;
    if (type !== undefined) room.type = type;
    if (beds !== undefined) room.beds = beds;
    if (pricePerNight !== undefined) room.pricePerNight = pricePerNight;
    if (description !== undefined) room.description = description;
    if (available !== undefined) room.available = available;

    await room.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Room updated successfully",
      data: room,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Delete a room
const deleteRoom = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { forceDelete, checkoutBooking: shouldCheckout } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid room ID format",
      });
    }

    await session.startTransaction();

    // Check if room exists
    const room = await Room.findById(id).session(session);
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Check if room has active bookings
    const activeBookings = await Booking.findOne({
      roomId: id,
      checkInDate: { $lte: new Date() },
      $expr: {
        $lt: [
          "$nights",
          {
            $ceil: {
              $divide: [
                { $subtract: [new Date(), "$checkInDate"] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        ],
      },
    })
      .populate("guestName", "name")
      .session(session);

    if (activeBookings && !forceDelete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message: "Room has active bookings",
        data: {
          requiresAction: true,
          bookingDetails: {
            guestName: activeBookings.guestName,
            bookingId: activeBookings._id,
            checkInDate: activeBookings.checkInDate,
            nights: activeBookings.nights,
          },
          options: [
            {
              action: "checkout",
              label: "Checkout current booking",
              description: `Checkout guest ${activeBookings.guestName} and free up the room`,
            },
            {
              action: "delete",
              label: "Delete booking",
              description: `Delete the booking for guest ${activeBookings.guestName}`,
            },
          ],
        },
      });
    }

    // If forceDelete is true and we have a specific action to take
    if (activeBookings && forceDelete) {
      if (shouldCheckout === true) {
        // Checkout the booking
        await checkoutBookingInternal(activeBookings._id, session);
      } else {
        // Delete the booking
        await deleteBookingInternal(activeBookings._id, session);
      }
    }

    await Room.findByIdAndDelete(id).session(session);
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Room deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Helper function to checkout a booking (internal use)
const checkoutBookingInternal = async (bookingId, session) => {
  const booking = await Booking.findById(bookingId)
    .populate("roomId", "roomNo type pricePerNight")
    .session(session);

  if (!booking) {
    throw new Error("Booking not found");
  }

  const room = booking.roomId;
  const checkOutDate = new Date();
  const actualNightsStayed = Math.max(
    1,
    Math.ceil((checkOutDate - booking.checkInDate) / (1000 * 60 * 60 * 24))
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

  // Create history record
  await BookingHistory.create(
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

  // Make room available again
  await Room.findByIdAndUpdate(room._id, { available: true }, { session });

  // Remove from active bookings
  await Booking.findByIdAndDelete(bookingId).session(session);
};

// Helper function to delete a booking (internal use)
const deleteBookingInternal = async (bookingId, session) => {
  const booking = await Booking.findById(bookingId).session(session);

  if (!booking) {
    throw new Error("Booking not found");
  }

  await Room.findByIdAndUpdate(
    booking.roomId,
    { available: true },
    { session }
  );

  await Booking.findByIdAndDelete(bookingId).session(session);
};

// Export all controllers
module.exports = {
  getRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
};

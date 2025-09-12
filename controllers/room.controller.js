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
    const { roomNo, type, beds, pricePerNight, description, available } =
      req.body;

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

    // Check if trying to make room available while it has a current booking
    if (available === true && room.available === false && room.currentBooking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message: "Room has an active booking",
        data: {
          requiresAction: true,
          bookingId: room.currentBooking.toString(),
          options: [
            {
              action: "checkout",
              label: "Checkout current booking",
              description: "Checkout the guest and free up the room",
            },
            {
              action: "delete",
              label: "Delete booking",
              description: "Delete the booking without checkout",
            },
          ],
        },
      });
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

    // Check if room has a current booking
    if (room.currentBooking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message: "Room has an active booking",
        data: {
          requiresAction: true,
          bookingId: room.currentBooking.toString(),
          options: [
            {
              action: "checkout",
              label: "Checkout current booking",
              description: "Checkout the guest and free up the room",
            },
            {
              action: "delete",
              label: "Delete booking",
              description: "Delete the booking without checkout",
            },
          ],
        },
      });
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

// Export all controllers
module.exports = {
  getRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
};

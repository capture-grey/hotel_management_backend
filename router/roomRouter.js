const express = require("express");
const {
  getRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
} = require("../controllers/room.controller");

const router = express.Router();

// GET all rooms (with pagination & filters)
router.get("/", getRooms);

// GET a single room by ID
router.get("/:id", getRoom);

// CREATE a new room
router.post("/", createRoom);

// UPDATE a room by ID
router.put("/:id", updateRoom);

// DELETE a room by ID
router.post("/:id", deleteRoom);

module.exports = router;

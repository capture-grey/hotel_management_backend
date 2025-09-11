const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/booking.controller");

router.get("/", bookingController.getBookings);
router.get("/:id", bookingController.getBooking);
router.post("/", bookingController.createBooking);
router.put("/:id", bookingController.updateBooking);
router.delete("/:id", bookingController.deleteBooking);
router.get("/summary", bookingController.getBookingSummary);

module.exports = router;

const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/booking.controller");
const bookingHistoryController = require("../controllers/booking.history.controller");

router.get("/", bookingController.getBookings);
router.get("/:id", bookingController.getBooking);
router.post("/", bookingController.createBooking);
router.put("/:id", bookingController.updateBooking);
router.delete("/:id", bookingController.deleteBooking);
router.post("/:id/checkout", bookingController.checkoutBooking);
router.get("/summary", bookingHistoryController.getBookingHistory);
module.exports = router;

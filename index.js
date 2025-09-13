// external imports
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const serverless = require("serverless-http");
const cors = require("cors");

// internal imports
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");
const connectDB = require("./config/db.js");

const authRouter = require("./router/authRouter");
const roomRouter = require("./router/roomRouter");
const bookingRouter = require("./router/bookingRouter");

// create express app
const app = express();

// env
dotenv.config();
connectDB();

//cors allowed urls
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://hotel-management-frontend-fawn.vercel.app",
    ],
  })
);

// parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// routes
app.get("/", (req, res) => {
  res.status(200).json({ message: "Hello From Octobill" });
});

app.use("/api/auth", authRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/bookings", bookingRouter);

// error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// app.listen(process.env.PORT, () => {
//   console.log(`app listening to port ${process.env.PORT}`);
// });

// export for vercel
module.exports = app;
module.exports.handler = serverless(app);

const express = require("express");
const dotenv = require("dotenv");
const serverless = require("serverless-http");
const cors = require("cors");
const connectDB = require("./config/db");

const authRouter = require("./router/authRouter");
const roomRouter = require("./router/roomRouter");
const bookingRouter = require("./router/bookingRouter");
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");

const app = express();
dotenv.config();
connectDB();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://hotel-management-frontend-fawn.vercel.app",
      "https://hotel-management-frontend-git-main-rorshachs-projects-9fee91c2.vercel.app",
    ],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "Hello from Hotel Management" });
});

app.use("/api/auth", authRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/bookings", bookingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

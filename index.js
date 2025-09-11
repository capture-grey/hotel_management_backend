// external imports
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("path");
const cookieParser = require("cookie-parser");

//_____________________________________________________________________internal imports________________________________________________________________________
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");
const connectDB = require("./config/db.js");

//______________________________Routers__________________________________

const authRouter = require("./router/authRouter");
const roomRouter = require("./router/roomRouter");
const app = express();
dotenv.config();

// database connection
connectDB();

// request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//___________________________________________________________________API Routes_____________________________________________________________________________________
app.get("/", (req, res) => {
  res.status(200).json({ message: "Hello From Octobill" });
});

app.use("/api/auth", authRouter);
app.use("/api/rooms", roomRouter);

// 404 not found handler
app.use(notFoundHandler);

// common error handler
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`app listening to port ${process.env.PORT}`);
});

//module.exports = app;

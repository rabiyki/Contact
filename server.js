// server.js
import "dotenv/config";
import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";

import authPhone from "./routes/authPhone.js";
import googleAuth from "./routes/googleAuth.js";
import dashboard from "./routes/dashboard.js";
import admin from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }, // 7 days
  })
);

app.use("/auth", authPhone);
app.use("/auth", googleAuth);
app.use("/api", dashboard);
app.use("/admin", admin);
app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`gsync dashboard running on port ${port}`));

// routes/authPhone.js
// Verifies the OTP issued by the bot's .getpass command and creates a session.

import express from "express";
import { getDB } from "../db.js";

const router = express.Router();

// POST /auth/verify  { phone, otp }
router.post("/verify", async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: "Both phone and otp are required" });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, "");

  const db = await getDB();
  const record = await db.collection("otps").findOne({ phone: cleanPhone });

  if (!record) {
    return res.status(400).json({ error: "Send .getpass to the bot first" });
  }
  if (record.used) {
    return res.status(400).json({ error: "This OTP was already used, send .getpass again" });
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "OTP expired, send .getpass again" });
  }
  if (record.otp !== otp) {
    return res.status(400).json({ error: "Incorrect OTP" });
  }

  // mark the OTP as used — one-time use only
  await db.collection("otps").updateOne({ phone: cleanPhone }, { $set: { used: true } });

  // create the user record if it doesn't exist yet
  await db.collection("users").updateOne(
    { phone: cleanPhone },
    {
      $setOnInsert: {
        phone: cleanPhone,
        name: "",
        google_email: null,
        refresh_token: null,
        token_expiry: null,
        session_active: true, // session-status sync logic can be added later
        connected_at: null,
        created_at: new Date(),
      },
    },
    { upsert: true }
  );

  req.session.phone = cleanPhone;
  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

export default router;

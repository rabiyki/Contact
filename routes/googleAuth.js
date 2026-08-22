// routes/googleAuth.js
// Only the Google Contacts write scope is requested — no Gmail inbox
// access, no password. The user grants permission on Google's own
// consent screen.

import express from "express";
import { google } from "googleapis";
import { getDB } from "../db.js";
import { encrypt } from "../crypto-helper.js";
import { runSyncForNewUser } from "../sync.js";

const router = express.Router();

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /auth/google  -> redirect to Google's consent screen
router.get("/google", (req, res) => {
  if (!req.session.phone) return res.status(401).send("Please verify your phone number first");

  const client = oauthClient();
  const url = client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token
    prompt: "consent", // ensures a fresh refresh_token each time
    scope: ["https://www.googleapis.com/auth/contacts"],
    state: req.session.phone, // used in the callback to identify who's connecting
  });

  res.redirect(url);
});

// GET /auth/google/callback
router.get("/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send("Invalid callback");

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // can happen if the user connected before — prompt: "consent" above
      // should normally prevent this
      return res.status(400).send(
        "Didn't receive a Google refresh token. Revoke prior access in your Google account settings and try again."
      );
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    const db = await getDB();
    await db.collection("users").updateOne(
      { phone: state },
      {
        $set: {
          google_email: profile.email,
          refresh_token: encrypt(tokens.refresh_token),
          token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connected_at: new Date(),
        },
      }
    );

    // as soon as this user connects, run mutual contact sync against
    // everyone else who is active + connected
    await runSyncForNewUser(state);

    res.redirect("/dashboard.html");
  } catch (err) {
    console.error("[google callback] error:", err);
    res.status(500).send("Failed to connect Google account");
  }
});

export default router;


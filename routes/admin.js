// routes/admin.js
// Simple password-protected admin panel — single shared password via env var.
// For anything beyond a couple of admins, swap this for per-admin accounts.

import express from "express";
import { getDB } from "../db.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: "Admin login required" });
  next();
}

// POST /admin/login  { password }
router.post("/login", (req, res) => {
  const { password } = req.body;
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD not set on the server" });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }
  req.session.isAdmin = true;
  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

// GET /admin/api/overview
router.get("/api/overview", requireAdmin, async (req, res) => {
  const db = await getDB();
  const users = db.collection("users");

  const [total, connected, activeSessions, totalSyncs] = await Promise.all([
    users.countDocuments({}),
    users.countDocuments({ google_email: { $ne: null } }),
    users.countDocuments({ session_active: true }),
    users
      .aggregate([
        { $project: { count: { $size: { $ifNull: ["$saved_to", []] } } } },
        { $group: { _id: null, total: { $sum: "$count" } } },
      ])
      .toArray(),
  ]);

  res.json({
    total_users: total,
    connected_users: connected,
    active_sessions: activeSessions,
    total_contact_syncs: totalSyncs[0]?.total || 0,
  });
});

// GET /admin/api/users?search=&page=1&limit=20
router.get("/api/users", requireAdmin, async (req, res) => {
  const db = await getDB();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const search = (req.query.search || "").trim();

  const filter = search
    ? {
        $or: [
          { phone: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
          { google_email: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db
      .collection("users")
      .find(filter, { projection: { refresh_token: 0 } })
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    db.collection("users").countDocuments(filter),
  ]);

  res.json({
    users: rows.map((u) => ({
      phone: u.phone,
      name: u.name,
      google_email: u.google_email,
      connected: !!u.google_email,
      session_active: !!u.session_active,
      saved_to_count: (u.saved_to || []).length,
      saved_by_count: u.saved_by_count || 0,
      created_at: u.created_at,
      connected_at: u.connected_at,
    })),
    total,
    page,
    limit,
  });
});

// DELETE /admin/api/users/:phone  — remove a user's stored data
router.delete("/api/users/:phone", requireAdmin, async (req, res) => {
  const db = await getDB();
  await db.collection("users").deleteOne({ phone: req.params.phone });
  res.json({ success: true });
});

export default router;

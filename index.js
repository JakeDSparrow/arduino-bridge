const express = require("express");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.set("trust proxy", false);

const PORT = process.env.PORT || 3000;
const RAILWAY_URL =
  "https://smartfarmingsystemforstringbeans-web-production.up.railway.app";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toSystemId(raw) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid system_id");
  return id;
}

/**
 * Mobile app writes control state here (auto/manual + pump).
 */
app.post("/api/irrigation-state", async (req, res) => {
  try {
    const systemId = toSystemId(req.body?.system_id);
    const autoModeEnabled = Boolean(req.body?.auto_mode_enabled);
    const pumpStatus = Boolean(req.body?.pump_status);

    const { data, error } = await supabase
      .from("irrigation_system")
      .update({
        auto_mode_enabled: autoModeEnabled,
        pump_status: pumpStatus,
        controller_online: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", systemId)
      .select("id, auto_mode_enabled, pump_status, last_seen_at, controller_online")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        ok: false,
        error: `irrigation_system id=${systemId} not found`,
      });
    }

    return res.status(200).json({
      system_id: data.id,
      auto_mode_enabled: Boolean(data.auto_mode_enabled),
      pump_status: Boolean(data.pump_status),
      controller_online: Boolean(data.controller_online),
      last_seen_at: data.last_seen_at ?? null,
    });
  } catch (err) {
    console.error("POST /api/irrigation-state error:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "Invalid irrigation-state payload",
    });
  }
});

/**
 * Arduino polls this every 2 seconds.
 */
app.get("/api/irrigation-state", async (req, res) => {
  console.log("🔍 Arduino GET query:", req.query); // ADD THIS
  console.log("🔍 Raw system_id:", req.query?.system_id); // ADD THIS
  try {
    const systemId = toSystemId(req.query?.system_id);

    const { data, error } = await supabase
      .from("irrigation_system")
      .select("id, auto_mode_enabled, pump_status, last_seen_at, controller_online")
      .eq("id", systemId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // keep predictable shape for Arduino parser
      return res.status(200).json({
        system_id: systemId,
        auto_mode_enabled: false,
        pump_status: false,
        controller_online: false,
        last_seen_at: null,
      });
    }

    return res.status(200).json({
      system_id: data.id,
      auto_mode_enabled: Boolean(data.auto_mode_enabled),
      pump_status: Boolean(data.pump_status),
      controller_online: Boolean(data.controller_online),
      last_seen_at: data.last_seen_at ?? null,
    });
  } catch (err) {
    console.error("GET /api/irrigation-state error:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "Invalid system_id",
    });
  }
});

/**
 * Arduino sensor reporting passthrough.
 */
app.post("/api/sensor-reading", async (req, res) => {
  try {
    console.log("📡 Received from Arduino:", req.body);

    const response = await fetch(`${RAILWAY_URL}/api/sensor-reading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(response.status).json(data);
  } catch (e) {
    console.error("❌ Bridge error:", e);
    return res.status(500).json({ error: "Bridge error" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "OK" }));

app.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));

const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

app.set("trust proxy", false);

const PORT = process.env.PORT || 3000;
const RAILWAY_URL =
  "https://smartfarmingsystemforstringbeans-web-production.up.railway.app";

/**
 * In-memory irrigation state store.
 * Keyed by system_id so multiple farms/systems can work.
 */
const irrigationStateBySystemId = new Map();

/**
 * Normalize incoming payload and enforce types.
 */
function normalizeIrrigationState(payload = {}) {
  const systemId = Number(payload.system_id);
  if (!Number.isFinite(systemId) || systemId <= 0) {
    throw new Error("Invalid system_id");
  }

  const autoModeEnabled = Boolean(payload.auto_mode_enabled);
  const pumpStatus = Boolean(payload.pump_status);

  return {
    system_id: systemId,
    auto_mode_enabled: autoModeEnabled,
    pump_status: pumpStatus,
    updated_at: new Date().toISOString(),
  };
}

/**
 * POST from mobile app (dashboard/waterDistribution):
 * Save latest auto/manual + pump state for Arduino polling.
 */
app.post("/api/irrigation-state", (req, res) => {
  try {
    const normalized = normalizeIrrigationState(req.body);
    irrigationStateBySystemId.set(normalized.system_id, normalized);

    console.log("✅ Irrigation state updated:", normalized);
    return res.status(200).json({
      ok: true,
      message: "Irrigation state saved",
      state: normalized,
    });
  } catch (err) {
    console.error("❌ Invalid irrigation-state payload:", req.body, err.message);
    return res.status(400).json({
      ok: false,
      error: err.message || "Invalid irrigation-state payload",
    });
  }
});

/**
 * GET from Arduino every 2s:
 * Returns latest state for this system_id.
 */
app.get("/api/irrigation-state", (req, res) => {
  const systemId = Number(req.query.system_id);

  if (!Number.isFinite(systemId) || systemId <= 0) {
    return res.status(400).json({
      ok: false,
      error: "system_id query param is required and must be a number",
    });
  }

  const state =
    irrigationStateBySystemId.get(systemId) || {
      system_id: systemId,
      auto_mode_enabled: false,
      pump_status: false,
      updated_at: null,
    };

  return res.status(200).json(state);
});

/**
 * POST from Arduino sensor readings:
 * Forward to your main Railway backend.
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

    console.log("✅ Forwarded to Railway:", data);
    return res.status(response.status).json(data);
  } catch (e) {
    console.error("❌ Bridge error:", e);
    return res.status(500).json({ error: "Bridge error" });
  }
});

app.get("/health", (_req, res) =>
  res.json({
    status: "OK",
    bridge: "running",
    tracked_systems: irrigationStateBySystemId.size,
  })
);

app.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));

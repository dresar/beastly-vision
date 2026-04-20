// Public ingest endpoint untuk perangkat ESP32-CAM / bridge MQTT-YOLOv8.
// Tidak memerlukan JWT user — autentikasi via device api_key di payload.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DetObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface IngestPayload {
  device_api_key: string;
  image_url?: string;
  detected_objects?: DetObject[];
  timestamp?: string;
}

const HIGH = new Set(["person", "human", "manusia", "wild_boar", "babi_hutan", "tiger", "harimau", "elephant", "gajah"]);
const MEDIUM = new Set(["monkey", "monyet", "deer", "rusa", "wild_dog", "anjing_liar"]);

function classifyThreat(objs: DetObject[]): { level: string; primary: string | null; conf: number } {
  if (!objs?.length) return { level: "low", primary: null, conf: 0 };
  const sorted = [...objs].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  let level = "low";
  for (const o of objs) {
    if (HIGH.has(o.label.toLowerCase())) { level = "high"; break; }
    if (MEDIUM.has(o.label.toLowerCase())) level = "medium";
  }
  return { level, primary: top.label, conf: top.confidence };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as IngestPayload;
    if (!body?.device_api_key) {
      return new Response(JSON.stringify({ error: "Missing device_api_key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth via device api_key
    const { data: device, error: deviceErr } = await supabase
      .from("devices")
      .select("id, name")
      .eq("api_key", body.device_api_key)
      .maybeSingle();

    if (deviceErr || !device) {
      return new Response(JSON.stringify({ error: "Invalid device API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const objs = body.detected_objects ?? [];
    const { level, primary, conf } = classifyThreat(objs);
    const detectedAt = body.timestamp ?? new Date().toISOString();

    // Mark device online
    await supabase
      .from("devices")
      .update({ status: "online", last_seen: detectedAt })
      .eq("id", device.id);

    // Insert detection
    const { data: det, error: detErr } = await supabase
      .from("detections")
      .insert({
        device_id: device.id,
        image_url: body.image_url ?? null,
        detected_objects: objs,
        primary_label: primary,
        max_confidence: conf,
        threat_level: level,
        detected_at: detectedAt,
      })
      .select("id")
      .single();

    if (detErr) {
      return new Response(JSON.stringify({ error: detErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // High threat → create notification
    if (level === "high") {
      await supabase.from("notifications").insert({
        detection_id: det.id,
        title: `Ancaman tinggi terdeteksi: ${primary}`,
        message: `Perangkat ${device.name} mendeteksi ${primary} dengan confidence ${(conf * 100).toFixed(0)}%`,
        severity: "high",
      });
    }

    return new Response(
      JSON.stringify({ success: true, detection_id: det.id, threat_level: level }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { z } from 'zod';

export const IngestSchema = z.object({
  device_api_key: z.string(),
  image_url: z.string().url(),
  primary_label: z.string().optional(),
  threat_level: z.string().optional(),
  max_confidence: z.number().optional(),
  detected_objects: z.array(z.any()).optional(),
});

export type IngestData = z.infer<typeof IngestSchema>;

/**
 * Shared ingestion logic for processing data from IoT devices.
 * Can be called from TanStack Start server functions or a standalone Express/Nitro server.
 */
export async function processIngestion(data: IngestData) {
    const { default: sql } = await import('./db.server');
    
    // 1. Verify Device
    const [device] = await sql`
      SELECT id FROM devices WHERE api_key = ${data.device_api_key}
    `;

    if (!device) {
      throw new Error('Invalid API Key');
    }

    // 2. Insert Detection
    const [det] = await sql`
      INSERT INTO detections (device_id, image_url, primary_label, threat_level, max_confidence, detected_objects)
      VALUES (${device.id}, ${data.image_url}, ${data.primary_label || 'unknown'}, ${data.threat_level || 'low'}, ${data.max_confidence || 0}, ${JSON.stringify(data.detected_objects || [])})
      RETURNING *
    `;

    // 3. Create Notification if High Threat
    if (data.threat_level === 'high') {
      await sql`
        INSERT INTO notifications (detection_id, title, message, severity)
        VALUES (${det.id}, 'Ancaman Tinggi Terdeteksi!', ${`Objek ${data.primary_label || 'unknown'} terdeteksi di perangkat.`}, 'high')
      `;
    }

    // 4. Update Device Last Seen
    await sql`
      UPDATE devices SET last_seen = NOW(), status = 'online' WHERE id = ${device.id}
    `;

    return { success: true, id: det.id };
}

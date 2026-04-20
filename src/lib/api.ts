import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from './auth-middleware';

export const getDetectionsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { default: sql } = await import('./db.server');
    return await sql`
      SELECT primary_label, detected_at, threat_level 
      FROM detections 
      ORDER BY detected_at DESC 
      LIMIT 1000
    `;
  });

export const getDevicesFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { default: sql } = await import('./db.server');
    return await sql`
      SELECT id, name, location, latitude, longitude, status, last_seen, created_at 
      FROM devices 
      ORDER BY created_at DESC
    `;
  });

export const getNotificationsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { default: sql } = await import('./db.server');
    return await sql`
      SELECT n.id, n.title, n.message, n.severity, n.is_read, n.created_at, d.image_url
      FROM notifications n
      LEFT JOIN detections d ON n.detection_id = d.id
      ORDER BY n.created_at DESC
      LIMIT 50
    `;
  });

export const getStatsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { default: sql } = await import('./db.server');
    const [counts] = await sql`
      SELECT 
        (SELECT COUNT(*) FROM devices) as device_count,
        (SELECT COUNT(*) FROM detections WHERE detected_at > NOW() - INTERVAL '24 hours') as detections_24h,
        (SELECT COUNT(*) FROM detections WHERE threat_level = 'high' AND detected_at > NOW() - INTERVAL '24 hours') as threats_24h
    `;
    return counts;
  });

const UpdateProfileSchema = z.object({
  full_name: z.string().min(1),
});

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => UpdateProfileSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { default: sql } = await import('./db.server');
    return await sql`
      UPDATE profiles
      SET full_name = ${data.full_name}, updated_at = NOW()
      WHERE id = ${context.userId}
      RETURNING *
    `;
  });

export const ingestFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => 
    z.object({
      device_api_key: z.string(),
      image_url: z.string().url(),
      primary_label: z.string().optional(),
      threat_level: z.string().optional(),
      max_confidence: z.number().optional(),
      detected_objects: z.array(z.any()).optional(),
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const { processIngestion } = await import('./ingest-engine.server');
    return await processIngestion(data);
  });

export const addDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => 
    z.object({
      name: z.string().min(1),
      location: z.string().optional(),
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const { default: sql } = await import('./db.server');
    return await sql`
      INSERT INTO devices (name, location)
      VALUES (${data.name}, ${data.location || null})
      RETURNING *
    `;
  });

export const removeDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { default: sql } = await import('./db.server');
    return await sql`
      DELETE FROM devices WHERE id = ${data.id}
      RETURNING *
    `;
  });

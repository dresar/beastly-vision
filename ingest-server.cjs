/**
 * Standalone Ingestion Server for WildGuard
 * Use this to handle IoT device payloads (ESP32-CAM) directly.
 * 
 * Run with: node ingest-server.cjs
 */

const http = require('http');
const postgres = require('postgres');
require('dotenv').config();

const PORT = process.env.INGEST_PORT || 8090;
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/ingest') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                
                // 1. Verify Device
                const [device] = await sql`
                    SELECT id FROM devices WHERE api_key = ${data.device_api_key}
                `;

                if (!device) {
                    res.statusCode = 401;
                    res.end(JSON.stringify({ error: 'Invalid API Key' }));
                    return;
                }

                // 2. Insert Detection
                const [det] = await sql`
                    INSERT INTO detections (device_id, image_url, primary_label, threat_level, max_confidence, detected_objects)
                    VALUES (${device.id}, ${data.image_url}, ${data.primary_label || 'unknown'}, ${data.threat_level || 'low'}, ${data.max_confidence || 0}, ${JSON.stringify(data.detected_objects || [])})
                    RETURNING id
                `;

                // 3. Create Notification if High Threat
                if (data.threat_level === 'high') {
                    await sql`
                        INSERT INTO notifications (detection_id, title, message, severity)
                        VALUES (${det.id}, 'Ancaman Tinggi Terdeteksi!', ${`Objek ${data.primary_label || 'unknown'} terdeteksi.`}, 'high')
                    `;
                }

                // 4. Update status
                await sql`UPDATE devices SET last_seen = NOW(), status = 'online' WHERE id = ${device.id}`;

                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, id: det.id }));
                console.log(`[INGEST] Success: ${data.primary_label} from device ${device.id}`);
                
            } catch (err) {
                console.error('[INGEST] Error:', err.message);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Standalone Ingestion Server running on http://localhost:${PORT}/ingest`);
    console.log(`   Target this URL from your ESP32-CAM or Python Worker.`);
});

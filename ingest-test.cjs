/**
 * Back-end Verification Script (Debug Version)
 */

const SERVER_URL = 'http://localhost:8082/_server?_serverFnId=ingestFn';
const DEVICE_API_KEY = '5a6b7c8d-9e0f-1a2b-3c4d-5e6f7a8b9c0d';

const testIngest = async () => {
    console.log('--- Testing Ingest Function ---');
    
    const payload = {
        device_api_key: DEVICE_API_KEY,
        image_url: "https://images.unsplash.com/photo-1549480017-d76466a4b7e8?auto=format&fit=crop&q=80&w=800",
        primary_label: "tiger",
        threat_level: "high",
        max_confidence: 0.98,
        detected_objects: [
            { label: "tiger", confidence: 0.98, bbox: [0.1, 0.2, 0.4, 0.5] }
        ]
    };

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        
        try {
            const data = JSON.parse(text);
            if (response.ok) {
                console.log('SUCCESS: Detection ingested successfully!');
                console.log('Response:', JSON.stringify(data, null, 2));
            } else {
                console.error('FAILED: Status', response.status);
                console.error('Data:', data);
            }
        } catch (e) {
            console.error('FAILED: Received non-JSON response.');
            console.error('Status:', response.status);
            console.error('Body preview:', text.substring(0, 500));
        }
    } catch (error) {
        console.error('FAILED: Error calling ingest endpoint.');
        console.error('Error:', error.message);
    }
};

testIngest();

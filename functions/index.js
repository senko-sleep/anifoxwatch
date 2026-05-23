// Firebase Cloud Function wrapping the aniwatch-api Hono app
// This re-exports the Hono app as a Firebase HTTPS function.
// The aniwatch-api is built separately in ./aniwatch-api/dist/

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

// Set region (us-central1 is default, use us-east1 for lower latency)
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// We dynamically import the ESM Hono app using an async wrapper
exports.api = onRequest(async (req, res) => {
  try {
    // Dynamically import the built ESM aniwatch-api server
    const { default: app } = await import('./aniwatch-api/dist/src/server.js');

    // Convert Firebase req/res to Fetch API Request
    const url = `https://${req.hostname}${req.originalUrl || req.url}`;
    const method = req.method;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    let body = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      // req.body is already parsed by Firebase, re-serialize it
      if (req.body) {
        body = JSON.stringify(req.body);
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      }
    }

    const fetchRequest = new Request(url, { method, headers, body });

    // Call the Hono app's fetch handler
    const honoResponse = await app.fetch(fetchRequest);

    // Stream the Hono response back to Firebase res
    res.status(honoResponse.status);
    honoResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseText = await honoResponse.text();
    res.send(responseText);
  } catch (err) {
    console.error('Firebase Function error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

async function poll() {
    console.log("Polling Clever Cloud for new deployment...");
    while (true) {
        try {
            const res = await fetch("https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/health");
            const data = await res.json();
            if (data.uptime < 1000) {
                console.log("New deployment detected! Uptime:", data.uptime);
                break;
            } else {
                console.log("Still running old version. Uptime:", data.uptime);
            }
        } catch (e) {
            console.log("Error checking health, might be deploying...");
        }
        await new Promise(r => setTimeout(r, 10000));
    }

    console.log("Testing stream endpoint...");
    try {
        const streamRes = await fetch("https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/stream/watch/anilist-189046?ep=1&title=Re%3AZERO%20-Starting%20Life%20in%20Another%20World-%20Season%203");
        const streamData = await streamRes.json();
        console.log("Stream API Response:", JSON.stringify(streamData, null, 2).substring(0, 500));
        if (streamData.sources && streamData.sources.length > 0) {
            console.log("✅ Success! Streaming sources returned.");
        } else {
            console.log("❌ Failed! No streaming sources.");
        }
    } catch (e) {
        console.error("Error testing stream:", e);
    }
}
poll();

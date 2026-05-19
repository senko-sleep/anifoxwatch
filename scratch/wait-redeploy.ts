async function run() {
    console.log("Waiting for new Clever Cloud redeploy to hot-swap...");
    console.log("Monitoring uptime...");
    
    // We wait until uptime drops below 90 seconds, meaning the new server has just booted up!
    let attempts = 0;
    while (attempts < 120) {
        try {
            const res = await fetch("https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/health");
            const data = await res.json();
            console.log(`[Attempt ${attempts + 1}] Health check - Uptime: ${data.uptime} seconds`);
            if (data.uptime < 90) {
                console.log("🎉 New deployment is live! Uptime is under 90s.");
                break;
            }
        } catch (e: any) {
            console.log(`[Attempt ${attempts + 1}] Server is currently swapping or building... (${e.message})`);
        }
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
    }

    console.log("\nTesting Watch API with title parameter on new deployment:");
    try {
        const testUrl = "https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/stream/watch/anilist-189046?ep=1&title=Re%3AZERO%20-Starting%20Life%20in%20Another%20World-%20Season%203";
        console.log("Fetching:", testUrl);
        const streamRes = await fetch(testUrl);
        const streamData = await streamRes.json();
        console.log("\n--- WATCH API RESPONSE ---");
        console.log(JSON.stringify(streamData, null, 2));
        console.log("--------------------------\n");
        if (streamData.sources && streamData.sources.length > 0) {
            console.log("✅ SUCCESS! Playable stream sources resolved on Clever Cloud!");
        } else {
            console.log("❌ FAILED! No stream sources found.");
        }
    } catch (e: any) {
        console.error("Error testing Watch API:", e.message);
    }
}

run();

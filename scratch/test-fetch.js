async function test() {
  const url = "https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/stream/watch/anilist-189046?ep=1";
  console.log("Fetching: " + url);
  try {
    const res = await fetch(url);
    console.log("Status: " + res.status);
    const text = await res.text();
    console.log("Body: " + text);
  } catch (err) {
    console.error(err);
  }
}
test();

async function test() {
  const url = "http://localhost:3001/api/stream/watch/anilist-189046?ep=1";
  console.log("Fetching: " + url);
  try {
    const res = await fetch(url);
    console.log("Status: " + res.status);
    const text = await res.text();
    console.log("Body: " + text.slice(0, 500));
  } catch (err) {
    console.error(err);
  }
}
test();

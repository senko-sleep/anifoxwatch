async function test() {
  try {
    const res = await fetch("https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io/api/anilist/graphql", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "{Media(id:189046){id}}" })
    });
    console.log("Status: " + res.status);
    const text = await res.text();
    console.log("Body: " + text.substring(0, 200));
  } catch (err) {
    console.error(err);
  }
}
test();

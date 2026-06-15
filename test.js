const apiKey = "daab02fe82f54d7099d94b0ce9fcecb6";
const url = `https://api.geoapify.com/v1/routing?waypoints=-7.2575,112.7521|-7.2600,112.7600&mode=drive&apiKey=${apiKey}`;
fetch(url).then(r => r.json()).then(data => console.log(JSON.stringify(data).substring(0, 500))).catch(console.error);

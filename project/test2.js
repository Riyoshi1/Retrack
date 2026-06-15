const apiKey = "daab02fe82f54d7099d94b0ce9fcecb6";
const w = [
  "-7.2575,112.7521",
  "-7.2600,112.7600",
  "-7.2700,112.7700"
];
const geoUrl = `https://api.geoapify.com/v1/routing?waypoints=${w.join('|')}&mode=drive&apiKey=${apiKey}`;

fetch(geoUrl)
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(console.error);

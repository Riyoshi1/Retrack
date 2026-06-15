import { JSDOM } from "jsdom";
const fetchPage = async () => {
    try {
        const dom = await JSDOM.fromURL("http://localhost:3000/", {
            runScripts: "dangerously",
            resources: "usable"
        });
        dom.window.onerror = function(msg, source, line, col, err) {
            console.log("On Error:", msg, line, col, err);
        };
        setTimeout(() => {
            console.log("Finished waiting.");
        }, 5000);
    } catch(e) { console.error("Err", e) }
}
fetchPage();

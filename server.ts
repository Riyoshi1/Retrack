import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Lazy initialize Firebase Admin
let adminInitialized = false;

function ensureAdminInitialized() {
  if (adminInitialized || getApps().length > 0) {
    adminInitialized = true;
    return true;
  }

  // Determine credentials
  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;

  let certConfig: any;

  if (serviceAccountStr) {
    certConfig = JSON.parse(serviceAccountStr);
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    certConfig = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  } else {
    console.error("Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY environment variables.");
    return false;
  }

  try {
    initializeApp({
      credential: cert(certConfig),
    });
    adminInitialized = true;
    console.log("Firebase Admin Initialized successfully.");
    return true;
  } catch (err: any) {
    if (/already exists/.test(err.message)) {
      adminInitialized = true;
      return true;
    }
    console.error("Firebase Admin Initialization Error:", err.message);
    return false;
  }
}


// Calculate distance via Haversine formula (meters)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function timeToMins(t: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mins = Math.floor(m % 60);
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Search POI Candidates via Photon API
async function searchPoiCandidates(query: string): Promise<any[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=id&limit=8`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data || !data.features || data.features.length === 0) return [];

    return data.features
      .filter((feat: any) => {
        const country = feat.properties?.country;
        if (!country) return true;
        const lowerCountry = country.toLowerCase();
        return (
          lowerCountry.includes("indonesia") ||
          lowerCountry === "id" ||
          lowerCountry.includes("indonesien")
        );
      })
      .map((feat: any) => {
        const props = feat.properties;
        const placeName = props.name || props.street || query;
        const cityName = props.city || "";
        const nameUnified = placeName && cityName && !placeName.toLowerCase().includes(cityName.toLowerCase())
          ? `${placeName}, ${cityName}`
          : placeName || cityName || query;
        return {
          name: nameUnified,
          latitude: feat.geometry.coordinates[1],
          longitude: feat.geometry.coordinates[0],
          address: props.city
            ? `${props.name || ""}, ${props.city}`
            : props.name,
        };
      });
  } catch (err) {
    console.error("POI candidates Photon query failed", err);
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Firebase Push Notification Endpoints ---
  // --- Push Notifications & Device Tokens ---
  app.post("/api/users/:uid/tokens", async (req, res) => {
    try {
      const { token } = req.body;
      const { uid } = req.params;
      if (!token) {
        return res.status(400).json({ error: "Token required" });
      }

      if (!ensureAdminInitialized()) {
        throw new Error("Admin SDK tidak terinisialisasi");
      }
      
      const db = getFirestore();
      const userRef = db.collection("users").doc(uid);
      await userRef.set({
        tokens: FieldValue.arrayUnion(token),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log(`Token saved successfully for user ${uid}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving token:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notifications/overlap", async (req, res) => {
    try {
      const { uid, activity1, activity2 } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID required" });
      }

      if (!ensureAdminInitialized()) {
        throw new Error("Admin SDK tidak terinisialisasi");
      }
      
      const db = getFirestore();
      const userDoc = await db.collection("users").doc(uid).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User tidak ditemukan" });
      }
      
      const tokens = userDoc.data()?.tokens || [];
      if (tokens.length === 0) {
        return res.json({ success: true, message: "Tidak ada token untuk dikirimkan notifikasi." });
      }
      
      const message = {
        notification: {
          title: "⚠️ Tabrakan Jadwal Terdeteksi!",
          body: `Jadwal "${activity1}" bertabrakan dengan jadwal "${activity2}". Harap atur ulang waktu Anda.`
        },
        tokens: tokens,
      };
      
      const messaging = getMessaging();
      const response = await messaging.sendEachForMulticast(message);
      console.log(`${response.successCount} notifikasi berhasil dikirim kepada user ${uid}.`);
      return res.json({ success: true, response });
    } catch (error: any) {
      console.error("Error sending overlap notification:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notifications/test", async (req, res) => {
    try {
      const { token, title, body } = req.body;
      if (!token) {
        return res.status(400).json({ error: "FCM token is required" });
      }

      if (!ensureAdminInitialized()) {
        throw new Error("Admin SDK not initialized");
      }

      const message = {
        notification: {
          title: title || "Halo dari Retrack! \uD83D\uDC4B",
          body: body || "Notifikasi berhasil dikonfigurasi menggunakan akun Google Anda.",
        },
        token: token,
      };

      const messaging = getMessaging();
      const response = await messaging.send(message);
      console.log("Successfully sent test message:", response);
      return res.json({ success: true, messageId: response });
    } catch (error: any) {
      console.error("Error sending test message:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Location search backend proxy (Photon with Nominatim fallback)
  app.get("/api/search_location", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Kolom pencarian kosong" });
      }

      let results: any[] = [];

      // 1. Try Photon API inside a safe nested block
      try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=id&limit=15`;
        const photonResponse = await fetch(photonUrl);
        if (photonResponse.ok) {
          const photonData = await photonResponse.json();
          if (photonData && photonData.features && photonData.features.length > 0) {
            results = photonData.features
              .filter((feat: any) => {
                if (!feat || !feat.geometry || !feat.geometry.coordinates) return false;
                const country = feat.properties?.country;
                if (!country) return true;
                const lowerCountry = country.toLowerCase();
                return (
                  lowerCountry.includes("indonesia") ||
                  lowerCountry === "id" ||
                  lowerCountry.includes("indonesien") ||
                  lowerCountry.includes("indo") ||
                  true // extremely permissive to ensure fuzzy query hits are not dropped
                );
              })
              .map((feat: any) => {
                const props = feat.properties || {};
                const placeName = props.name || props.street || props.housenumber || props.district || props.city || query;
                const cityName = props.city || "";
                const displayName = placeName && cityName && !placeName.toLowerCase().includes(cityName.toLowerCase())
                  ? `${placeName}, ${cityName}`
                  : placeName || cityName || query;

                const addressParts = [
                  props.street,
                  props.district,
                  props.city,
                  props.state,
                  props.country,
                ].filter(Boolean);

                return {
                  displayName,
                  formattedAddress: addressParts.join(", ") || displayName,
                  location: {
                    lat: feat.geometry.coordinates[1],
                    lng: feat.geometry.coordinates[0],
                  },
                };
              });
          }
        }
      } catch (photonErr) {
        console.error("Photon API failed to map or parse", photonErr);
      }

      // 2. Fall back to Nominatim with Indonesian filter if no results from Photon
      if (results.length === 0) {
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=10`;
          const nominatimResponse = await fetch(nominatimUrl, {
            headers: { "User-Agent": "Retrack-App/1.0" },
          });
          if (nominatimResponse.ok) {
            const nominatimData = await nominatimResponse.json();
            if (Array.isArray(nominatimData)) {
              results = nominatimData.map((item: any) => ({
                displayName: item.display_name.split(",")[0],
                formattedAddress: item.display_name,
                location: {
                  lat: parseFloat(item.lat),
                  lng: parseFloat(item.lon),
                },
              }));
            }
          }
        } catch (nominatimErr) {
          console.error("Nominatim fallback failed", nominatimErr);
        }
      }

      return res.json(results);
    } catch (e) {
      console.error("Main geocoding route error", e);
      res.status(500).json({ error: "Sistem sibuk" });
    }
  });

  app.post("/api/get_manual_route", async (req, res) => {
    try {
      const { activities } = req.body;
      if (!activities || activities.length < 2) {
        return res.json({ coords: [] });
      }

      const coordsStr = activities
        .map((a: any) => `${a.location.longitude},${a.location.latitude}`)
        .join(";");
      
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
      const rResponse = await fetch(routeUrl);
      const rData = await rResponse.json();

      let coords: any[] = [];
      if (rData.code === "Ok" && rData.routes && rData.routes.length > 0) {
        coords = rData.routes[0].geometry.coordinates.map((c: any[]) => [
          c[1],
          c[0],
        ]);
      } else {
        coords = activities.map((a: any) => [a.location.latitude, a.location.longitude]);
      }
      res.json({ coords });
    } catch (e) {
      console.error("Manual route generation failed", e);
      res.status(500).json({ error: "Sistem sibuk" });
    }
  });

  // Optimize & Routing Endpoint (TSP + Prescriptive Scheduler)
  app.post("/api/get_route", async (req, res) => {
    let { activities } = req.body;

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res.json({ options: [], sequence: [], conflicts: [] });
    }

    try {
      // 1. Bipartite Matching: Resolve any automatic POI selector nodes using centroid heuristic
      for (const act of activities) {
        if (act.isPoiSelector && act.poiQuery) {
          const candidates = await searchPoiCandidates(act.poiQuery);
          if (candidates.length > 0) {
            // Locate centroid of other fully defined activities
            const otherLocs = activities.filter(
              (a: any) =>
                a.id !== act.id && a.location && a.location.latitude
            );
            let bestCand = candidates[0];
            if (otherLocs.length > 0) {
              let minSumDist = Infinity;
              for (const cand of candidates) {
                let sumDist = 0;
                for (const ol of otherLocs) {
                  sumDist += getDistance(
                    cand.latitude,
                    cand.longitude,
                    ol.location.latitude,
                    ol.location.longitude
                  );
                }
                if (sumDist < minSumDist) {
                  minSumDist = sumDist;
                  bestCand = cand;
                }
              }
            }
            // Swap in matched POI coordinates
            act.location = {
              name: `${act.title} - ${bestCand.name}`,
              latitude: bestCand.latitude,
              longitude: bestCand.longitude,
            };
            act.isPoiSelector = false;
          }
        }
      }

      // 2. Parse Activities into FIXED and FLEXIBLE
      const fixedList = activities
        .filter((a) => a.type === "FIXED" && a.timeWindow?.start)
        .sort((a, b) => timeToMins(a.timeWindow.start) - timeToMins(b.timeWindow.start));

      const flexibleList = activities.filter((a) => a.type === "FLEXIBLE").slice(0, 8);

      // 3. Build Unified Location Map
      const allActs = [...fixedList, ...flexibleList];
      const n = allActs.length;

      // 4. Matrix Call: Fetch OSRM distance and duration table
      let durations = Array(n).fill(0).map(() => Array(n).fill(0));
      let distances = Array(n).fill(0).map(() => Array(n).fill(0));

      if (n >= 2) {
        try {
          const coordsStr = allActs
            .map((a: any) => `${a.location.longitude},${a.location.latitude}`)
            .join(";");
          const matrixUrl = `http://router.project-osrm.org/table/v1/driving/${coordsStr}?annotations=duration,distance`;
          const mResponse = await fetch(matrixUrl);
          const mData = await mResponse.json();

          if (mData.code === "Ok" && mData.durations && mData.distances) {
            for (let i = 0; i < n; i++) {
              for (let j = 0; j < n; j++) {
                const durSec = mData.durations[i][j] || 0;
                const distMet = mData.distances[i][j] || 0;
                durations[i][j] = i === j ? 0 : Math.max(1, Math.round(durSec / 60));
                distances[i][j] = distMet;
              }
            }
          }
        } catch (err) {
          console.error("OSRM table lookup failed, utilizing Haversine", err);
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              if (i === j) continue;
              const dist = getDistance(
                allActs[i].location.latitude,
                allActs[i].location.longitude,
                allActs[j].location.latitude,
                allActs[j].location.longitude
              );
              distances[i][j] = dist;
              durations[i][j] = Math.max(1, Math.round(dist / 583)); // 35km/h speed
            }
          }
        }
      }

      // 5. Implement Chronological Sorting
      let bestConflicts: any[] = [];
      let optimizedSequence = [...allActs].filter(a => a.timeWindow?.start).sort((a, b) => {
        const startA = timeToMins(a.timeWindow.start);
        const startB = timeToMins(b.timeWindow.start);
        
        if (startA === startB) {
          // Rule C fallback handling short durations logic (or we can handle it fully separately)
          if (a.timeWindow.end && b.timeWindow.end) {
             const durA = timeToMins(a.timeWindow.end) - startA;
             const durB = timeToMins(b.timeWindow.end) - startB;
             return durA - durB;
          }
          return 0;
        }
        return startA - startB;
      });

      // Implement Rule C: Overlap Conflict Logic
      for (let i = 0; i < optimizedSequence.length; i++) {
        for (let j = i + 1; j < optimizedSequence.length; j++) {
           const a1 = optimizedSequence[i];
           const a2 = optimizedSequence[j];
           if (!a1.timeWindow?.end || !a2.timeWindow?.start) continue;

           const end1 = timeToMins(a1.timeWindow.end);
           const start2 = timeToMins(a2.timeWindow.start);

           if (end1 > start2 && timeToMins(a1.timeWindow.start) < timeToMins(a2.timeWindow.end)) {
             bestConflicts.push({
               fromId: a1.id,
               toId: a2.id,
               travelTimeMins: 0,
               availableGapMins: start2 - end1,
               message: `Time Overlap: "${a1.title}" conflicts with "${a2.title}". Shorter duration prioritized in visual layout.`
             });
           }
        }
      }

      // 7. Render OSRM Route line for the continuous optimized sequence
      let coords: any[] = [];
      let alternativeOptions: any[] = [];
      let totalDurationMins = 0;

      if (optimizedSequence.length >= 2) {
        try {
          const coordsStr = optimizedSequence
            .map((a: any) => `${a.location.longitude},${a.location.latitude}`)
            .join(";");
          const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&alternatives=true`;
          const rResponse = await fetch(routeUrl);
          const rData = await rResponse.json();

          if (rData.code === "Ok" && rData.routes && rData.routes.length > 0) {
            coords = rData.routes[0].geometry.coordinates.map((c: any[]) => [
              c[1],
              c[0],
            ]);
            totalDurationMins = Math.max(
              1,
              Math.round(rData.routes[0].duration / 60)
            );
            
            // Extract alternative routes
            if (rData.routes.length > 1) {
              for (let i = 1; i < rData.routes.length; i++) {
                const alt = rData.routes[i];
                alternativeOptions.push({
                   id: i,
                   coords: alt.geometry.coordinates.map((c: any[]) => [c[1], c[0]]),
                   cost: Math.round(alt.duration / 60),
                   timeStr: `${Math.round(alt.duration / 60)} min`
                });
              }
            }
          }
        } catch (err) {
          console.error("OSRM routing line generation failed", err);
        }
      }

      // Ensure fallback line drawing if route failure
      if (coords.length === 0 && optimizedSequence.length > 0) {
        coords = optimizedSequence.map((a: any) => [
          a.location.latitude,
          a.location.longitude,
        ]);
      }

      // 8. Add real-time overdue warnings in Asia/Jakarta timezone
      try {
        const now = new Date();
        const formatterDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const todayJakartaStr = formatterDate.format(now);

        const formatterTime = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const timeJakartaStr = formatterTime.format(now);
        const nowMins = timeToMins(timeJakartaStr);

        for (const act of optimizedSequence) {
          if ((act.date === todayJakartaStr || act.isAlways) && act.type === "FIXED" && act.timeWindow?.start) {
            const actMins = timeToMins(act.timeWindow.start);
            if (actMins < nowMins) {
              bestConflicts.push({
                fromId: act.id,
                toId: act.id,
                travelTimeMins: 0,
                availableGapMins: 0,
                message: `Peringatan: Jadwal "${act.title}" telah terlewati atau sedang berlangsung jika menurut waktu saat ini (WIB: ${timeJakartaStr}).`
              });
            }
          }
        }
      } catch (timezoneErr) {
        console.error("Failed to append timezone conflicts", timezoneErr);
      }

      res.json({
        options: [
          {
            id: 0,
            coords,
            timeStr: `${totalDurationMins} min`,
            cost: totalDurationMins,
          },
          ...alternativeOptions
        ],
        sequence: optimizedSequence,
        conflicts: bestConflicts,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Sistem sibuk" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

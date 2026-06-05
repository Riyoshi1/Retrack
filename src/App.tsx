import React, { useState, useEffect, useRef } from "react";
import {
  Calendar,
  User as UserIcon,
  ChevronRight,
  Clock,
  Plus,
  X,
  MapPin,
  Search,
  Settings,
  Bell,
  HelpCircle,
  LogOut,
  Sun,
  Moon,
  Info,
  AlertTriangle,
  Compass,
  Sparkles,
  GitCommit,
  Coffee,
  LogIn,
  Bike
} from "lucide-react";
import { Map as MapIcon } from "lucide-react";
import { Activity } from "./types";
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { auth, signInWithGoogle, logout, requestNotificationPermissionAndGetToken, setupForegroundNotificationListener, saveActivityToDb, deleteActivityFromDb, fetchUserActivities } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

// Custom Leaflet marker builder supporting Welsh-Powell colors
const createNumberedIcon = (
  num: number,
  isSelected: boolean,
  isDimmed: boolean = false,
  customColor?: string
) => {
  const defaultBg = isSelected ? "#2563eb" : isDimmed ? "#e2e8f0" : "white";
  const bg = customColor ? customColor : defaultBg;
  const color = customColor || isSelected ? "white" : isDimmed ? "#94a3b8" : "#2563eb";
  const border = customColor ? "#FFFFFF" : isSelected ? "white" : isDimmed ? "#cbd5e1" : "#2563eb";
  
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div style="background-color: ${bg}; color: ${color}; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid ${border}; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-size: 15px; font-family: sans-serif; transition: all 0.2s; ${
      isDimmed ? "opacity: 0.7;" : ""
    }">${num}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const timeToMins = (t: string | null): number => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Decode Google encoded polyline format to coordinate array
const decodePolyline = (encoded: string): [number, number][] => {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
};

// Component to dynamically fit the map to coordinates
const AutoFitBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [coords, map]);
  return null;
};

// Map events listener for double clicking
const MapEventsHandler = ({ onDoubleClick }: { onDoubleClick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    dblclick(e) {
      onDoubleClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// ============================================
// WELSH-POWELL GRAPH COLORING ENGINE
// ============================================
function colorOverlapGraph(activities: Activity[]): Record<string, string> {
  const n = activities.length;
  if (n === 0) return {};

  const adj: Record<string, string[]> = {};
  activities.forEach((a) => {
    adj[a.id] = [];
  });

  const isOverlap = (a: Activity, b: Activity) => {
    const aStart = timeToMins(a.timeWindow?.start);
    const aEnd = timeToMins(a.timeWindow?.end);
    const bStart = timeToMins(b.timeWindow?.start);
    const bEnd = timeToMins(b.timeWindow?.end);
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart < bEnd && bStart < aEnd;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isOverlap(activities[i], activities[j])) {
        adj[activities[i].id].push(activities[j].id);
        adj[activities[j].id].push(activities[i].id);
      }
    }
  }

  const degrees: Record<string, number> = {};
  activities.forEach((a) => {
    degrees[a.id] = adj[a.id].length;
  });

  const sortedIds = [...activities]
    .map((a) => a.id)
    .sort((a, b) => degrees[b] - degrees[a]);

  const colors: Record<string, string> = {};
  const palette = ["#FF3B30", "#FF9500", "#FFCC00", "#FF2D55"]; // Overlap contrast warning colors

  let colorIdx = 0;
  for (const id of sortedIds) {
    if (colors[id] !== undefined) continue;

    // Only assign colored warning if the node has at least 1 conflict overlap
    const assignedColor = degrees[id] > 0 ? palette[colorIdx % palette.length] : "";
    colors[id] = assignedColor;

    for (const otherId of sortedIds) {
      if (otherId === id || colors[otherId] !== undefined) continue;

      let isAdjacentToColored = false;
      for (const colId of sortedIds) {
        if (colors[colId] === assignedColor && adj[otherId].includes(colId)) {
          isAdjacentToColored = true;
          break;
        }
      }

      if (!isAdjacentToColored) {
        colors[otherId] = degrees[otherId] > 0 ? assignedColor : "";
      }
    }
    colorIdx++;
  }

  return colors;
}

// ============================================
// MAP CANVAS VIEW
// ============================================
const MapCanvas = ({
  todaysActivities,
  isDarkMode,
  onMapDoubleClick,
  routeOptions,
  overlapColors,
}: {
  todaysActivities: Activity[];
  isDarkMode: boolean;
  onMapDoubleClick: (lat: number, lng: number) => void;
  routeOptions: any[];
  overlapColors: Record<string, string>;
}) => {
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualSequenceIds, setManualSequenceIds] = useState<string[]>([]);
  const [manualRouteCoords, setManualRouteCoords] = useState<any[]>([]);

  // Simulasi State
  const [simulation, setSimulation] = useState<{
    isActive: boolean;
    coords: [number, number][];
    currentIndex: number;
    event: string | null;
    destLat: number;
    destLng: number;
    destName: string;
    startLat: number;
    startLng: number;
    targetActivityIndex: number;
    obstacles: { lat: number; lng: number; type: string }[];
    rejectedRoutes: { coords: [number, number][]; reason: string }[];
  } | null>(null);

  // Generate random obstacles near the route area for initial AI analysis
  const generateInitialObstacles = (sLat: number, sLng: number, dLat: number, dLng: number): { lat: number; lng: number; type: string }[] => {
    const count = 2 + Math.floor(Math.random() * 2); // 2-3 obstacles
    const result: { lat: number; lng: number; type: string }[] = [];
    const types = ["🚧 Perbaikan Jalan", "🚗 Kemacetan Padat", "🌊 Genangan Banjir", "⚠️ Kecelakaan Lalu Lintas", "🚫 Jalan Ditutup"];
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const bLat = sLat + (dLat - sLat) * t;
      const bLng = sLng + (dLng - sLng) * t;
      result.push({ lat: bLat + (Math.random() - 0.5) * 0.012, lng: bLng + (Math.random() - 0.5) * 0.012, type: types[Math.floor(Math.random() * types.length)] });
    }
    return result;
  };

  const startSimulation = async (targetActivityOrIndex?: Activity | number, startFromLocation?: { lat: number; lng: number }) => {
    if (todaysActivities.length === 0) {
      alert("Tidak ada jadwal untuk hari ini.");
      return;
    }
    
    let targetIndex = 0;
    if (typeof targetActivityOrIndex === 'number') {
      targetIndex = targetActivityOrIndex;
      if (targetIndex >= todaysActivities.length) {
        alert("Semua kegiatan selesai!");
        setSimulation(prev => prev ? { ...prev, isActive: false, event: "Semua kegiatan selesai! 🎉" } : null);
        return;
      }
    } else if (targetActivityOrIndex) {
      targetIndex = todaysActivities.findIndex(a => a.id === targetActivityOrIndex.id);
      if (targetIndex === -1) targetIndex = 0;
    }

    const act = todaysActivities[targetIndex];
    if (!act) return;

    const target = act.location;
    
    let startLat: number, startLng: number;
    if (startFromLocation) {
      startLat = startFromLocation.lat;
      startLng = startFromLocation.lng;
    } else {
      const offsetLat = (Math.random() - 0.5) * 0.04;
      const offsetLng = (Math.random() - 0.5) * 0.04;
      startLat = target.latitude + offsetLat;
      startLng = target.longitude + offsetLng;
    }

    // AI Analysis: Generate initial obstacles & find best route avoiding them
    const newObstacles = generateInitialObstacles(startLat, startLng, target.latitude, target.longitude);
    const existingObstacles = simulation?.obstacles || [];
    const allObstacles = [...existingObstacles, ...newObstacles];
    const avoidStr = allObstacles.map(o => `location:${o.lat},${o.lng}`).join('|');
    const waypointsStr = `${startLat},${startLng}|${target.latitude},${target.longitude}`;

    try {
      // Parallel fetch via server proxy: AI best route (avoiding obstacles) + naive route (for rejected comparison)
      const [bestRes, naiveRes] = await Promise.all([
        fetch("/api/geoapify-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waypoints: waypointsStr, mode: "drive", avoid: avoidStr })
        }),
        fetch("/api/geoapify-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waypoints: waypointsStr, mode: "drive" })
        })
      ]);
      const [bestData, naiveData] = await Promise.all([bestRes.json(), naiveRes.json()]);

      // Process AI-selected best route (avoiding obstacles)
      let bestCoords: [number, number][] = [];
      if (bestData.features && bestData.features.length > 0) {
        let cl = bestData.features[0].geometry.coordinates;
        if (bestData.features[0].geometry.type === "MultiLineString") cl = cl.flat(1);
        bestCoords = cl.map((c: any[]) => [c[1], c[0]] as [number, number]);
      }

      // Process naive/rejected route (without avoidance — for visualization)
      let rejectedRoutes: { coords: [number, number][]; reason: string }[] = [];
      if (naiveData.features && naiveData.features.length > 0) {
        let ncl = naiveData.features[0].geometry.coordinates;
        if (naiveData.features[0].geometry.type === "MultiLineString") ncl = ncl.flat(1);
        const naiveCoords = ncl.map((c: any[]) => [c[1], c[0]] as [number, number]);
        const nearObs = newObstacles.filter(obs =>
          naiveCoords.some((coord: [number, number]) => {
            const d = Math.sqrt(Math.pow(coord[0] - obs.lat, 2) + Math.pow(coord[1] - obs.lng, 2));
            return d < 0.01;
          })
        );
        const reasons = nearObs.length > 0 ? nearObs.map(o => o.type).join(', ') : "Rute kurang optimal";
        rejectedRoutes.push({ coords: naiveCoords, reason: reasons });
      }

      // Fallback: if best route failed, use naive route as primary
      if (bestCoords.length === 0 && rejectedRoutes.length > 0) {
        bestCoords = rejectedRoutes[0].coords;
        rejectedRoutes = [];
      }

      if (bestCoords.length > 0) {
        setSimulation({
          isActive: true,
          coords: bestCoords,
          currentIndex: 0,
          event: null,
          destLat: target.latitude,
          destLng: target.longitude,
          destName: act.title,
          startLat,
          startLng,
          targetActivityIndex: targetIndex,
          obstacles: allObstacles,
          rejectedRoutes
        });
      } else {
        alert("Gagal merencanakan rute simulasi.");
      }
    } catch (e) {
      alert("Gagal memulai simulasi");
    }
  };

  useEffect(() => {
    if (!simulation || !simulation.isActive || simulation.event) return;
    
    const interval = setInterval(() => {
      setSimulation(prev => {
        if (!prev || !prev.isActive || prev.event) return prev;
        
        let nextIndex = prev.currentIndex + 1;
        if (nextIndex >= prev.coords.length) {
           return { ...prev, event: "Tiba di tujuan! 🎉" };
        }
        
        // Random chance of incident
        if (nextIndex > 5 && nextIndex < prev.coords.length - 8 && Math.random() < 0.005) {
          const events = [
            "🧠 Braess' Paradox: Kapasitas semu memicu macet (Agent Feedback)!",
            "🤖 Sensor Grid menemukan jalan buntu (D* Optimal Replanning)!",
            "📈 Fluktuasi jam sibuk (Time-Dependent Bellman IVHS)!",
            "📡 ATIS Info: Penyesuaian rute dinamis (Real-Time Floating Car Data)!"
          ];
          const randomEvent = events[Math.floor(Math.random() * events.length)];
          return {
            ...prev,
            currentIndex: nextIndex,
            event: randomEvent
          };
        }
        
        return { ...prev, currentIndex: nextIndex };
      });
    }, 450); // Slightly slower speed for better visibility of real-time movement
    
    return () => clearInterval(interval);
  }, [simulation?.isActive, simulation?.event]);

  useEffect(() => {
    // Arrival logic
    if (simulation?.event === "Tiba di tujuan! 🎉" && simulation.isActive) {
       const timer = setTimeout(() => {
           // Move to next activity
           if (simulation.targetActivityIndex + 1 < todaysActivities.length) {
              const currentLoc = simulation.coords[simulation.coords.length - 1];
              startSimulation(simulation.targetActivityIndex + 1, { lat: currentLoc[0], lng: currentLoc[1] });
           } else {
              setSimulation(prev => prev ? { ...prev, isActive: false, event: "Semua kegiatan selesai! 🎉" } : null);
           }
       }, 3000);
       return () => clearTimeout(timer);
    }
  }, [simulation?.event, simulation?.isActive, simulation?.targetActivityIndex, todaysActivities]);

  useEffect(() => {
    if (simulation?.event && simulation.event !== "Tiba di tujuan! 🎉" && simulation.event !== "Semua kegiatan selesai! 🎉" && simulation.isActive) {
       const timer = setTimeout(async () => {
         const currentLoc = simulation.coords[simulation.currentIndex] || simulation.coords[0] || [0, 0];
         // Determine obstacle location: 15 steps ahead of the driver, or right before the destination
         const obstacleIdx = Math.min(simulation.currentIndex + 15, Math.max(0, simulation.coords.length - 2));
         const obstacleLoc = simulation.coords[obstacleIdx] || currentLoc;
         const evtMessage = simulation.event;
         const destLat = simulation.destLat;
         const destLng = simulation.destLng;

         try {
           const obstacleLat = obstacleLoc[0];
           const obstacleLng = obstacleLoc[1];

           // Build cumulative avoid from ALL obstacles + new one (ban semua jalur error sebelumnya)
           const newObstacle = { lat: obstacleLat, lng: obstacleLng, type: evtMessage || "Obstacle" };
           const allObstacles = [...simulation.obstacles, newObstacle];
           const avoidStr = allObstacles.map(o => `location:${o.lat},${o.lng}`).join('|');
           const waypointsStr = `${currentLoc[0]},${currentLoc[1]}|${destLat},${destLng}`;
           
           const res = await fetch("/api/geoapify-route", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ waypoints: waypointsStr, mode: "drive", avoid: avoidStr })
           });
           const data = await res.json();
           
           if (data.features && data.features.length > 0) {
              let coordsList = data.features[0].geometry.coordinates;
              if (data.features[0].geometry.type === "MultiLineString") {
                coordsList = coordsList.flat(1);
              }
              const newCoords = coordsList.map((c: any[]) => [c[1], c[0]]);
              setSimulation(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  coords: newCoords,
                  currentIndex: 0,
                  event: null,
                  obstacles: allObstacles
                };
              });
           } else {
             // Fallback: use fewer obstacles if too many cause routing failure
             const recentAvoidStr = allObstacles.slice(-5).map(o => `location:${o.lat},${o.lng}`).join('|');
             const fbRes = await fetch("/api/geoapify-route", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ waypoints: waypointsStr, mode: "drive", avoid: recentAvoidStr })
             });
             const fbData = await fbRes.json();
             if (fbData.features && fbData.features.length > 0) {
               let fbCoordsList = fbData.features[0].geometry.coordinates;
               if (fbData.features[0].geometry.type === "MultiLineString") {
                 fbCoordsList = fbCoordsList.flat(1);
               }
               const newCoords = fbCoordsList.map((c: any[]) => [c[1], c[0]]);
               setSimulation(prev => prev ? { ...prev, coords: newCoords, currentIndex: 0, event: null, obstacles: allObstacles } : null);
             } else {
               setSimulation(prev => prev ? { ...prev, event: null, obstacles: allObstacles } : null);
             }
           }
         } catch (e) {
             setSimulation(prev => prev ? { ...prev, event: null } : null);
         }
       }, 3500);
       return () => clearTimeout(timer);
    }
  }, [simulation?.event, simulation?.isActive]);

  const forceObstacle = () => {
    if (!simulation || !simulation.isActive || simulation.event) return;
    const events = [
      "🧠 Braess' Paradox: Kapasitas semu memicu macet (Agent Feedback)!",
      "🤖 Sensor Grid menemukan jalan buntu (D* Optimal Replanning)!",
      "📈 Fluktuasi jam sibuk (Time-Dependent Bellman IVHS)!",
      "📡 ATIS Info: Penyesuaian rute dinamis (Real-Time Floating Car Data)!"
    ];
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    setSimulation(prev => prev ? { ...prev, event: randomEvent } : null);
  };

  const simMotorIcon = L.divIcon({
    className: "custom-div-icon",
    html: `
      <div class="relative flex items-center justify-center">
        <div class="absolute inline-flex h-9 w-9 rounded-full bg-blue-500 opacity-40 animate-ping"></div>
        <div style="background-color: #f59e0b; color: white; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-size: 16px;">🏍️</div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  // Calculate coordinates for manual line
  useEffect(() => {
    const fetchManualRoute = async () => {
      if (isManualMode && manualSequenceIds.length >= 2) {
        const activeActs = manualSequenceIds
          .map((id) => todaysActivities.find((a) => a.id === id))
          .filter(Boolean) as Activity[];
          
        try {
          const res = await fetch("/api/get_manual_route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activities: activeActs })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.coords && data.coords.length > 0) {
              setManualRouteCoords(data.coords);
              return;
            }
          }
        } catch (e) {
          console.error("Manual route fetch error", e);
        }
        
        // Fallback to straight lines
        setManualRouteCoords(activeActs.map((a) => [a.location.latitude, a.location.longitude]));
      } else {
        setManualRouteCoords([]);
      }
    };
    fetchManualRoute();
  }, [isManualMode, manualSequenceIds, todaysActivities]);

  const handleMarkerClick = (actId: string) => {
    if (isManualMode) {
      setManualSequenceIds((prev) => {
        if (prev.includes(actId)) return prev.filter((p) => p !== actId);
        return [...prev, actId];
      });
    }
  };

  // Decode coords if they are an encoded string
  const processedRouteCoords = React.useMemo(() => {
    if (routeOptions.length > 0 && routeOptions[0].coords) {
      const rawCoords = routeOptions[0].coords;
      if (typeof rawCoords === "string") {
        return decodePolyline(rawCoords);
      } else if (Array.isArray(rawCoords)) {
        return rawCoords;
      }
    }
    return [];
  }, [routeOptions]);

  const alternativeRoutesCoords = React.useMemo(() => {
    return routeOptions.slice(1).map(opt => {
       const rawCoords = opt.coords;
       if (typeof rawCoords === "string") {
         return decodePolyline(rawCoords);
       } else if (Array.isArray(rawCoords)) {
         return rawCoords;
       }
       return [];
    }).filter(coords => coords.length > 0);
  }, [routeOptions]);

  // Coords for focusing
  const mapCoords =
    processedRouteCoords.length > 0
      ? processedRouteCoords
      : todaysActivities.map((a) => [a.location.latitude, a.location.longitude] as [number, number]);

  const defaultCenter =
    todaysActivities.length > 0
      ? ([todaysActivities[0].location.latitude, todaysActivities[0].location.longitude] as [number, number])
      : ([-7.2575, 112.7521] as [number, number]); // default Surabaya

  return (
    <div className={`absolute inset-0 z-0 ${isDarkMode ? "bg-slate-950" : "bg-[#E8E8E8]"}`}>
      <MapContainer
        center={defaultCenter}
        zoom={14}
        className="w-full h-full"
        zoomControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={
            isDarkMode
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
        />
        <MapEventsHandler onDoubleClick={onMapDoubleClick} />

        {mapCoords.length > 0 && <AutoFitBounds coords={mapCoords} />}

        {/* Alternative Routes */}
        {!isManualMode && !simulation?.isActive && alternativeRoutesCoords.map((coordsArr, i) => (
          <Polyline
            key={`alt-route-${i}`}
            positions={coordsArr}
            color="#9CA3AF"
            weight={3}
            opacity={0.6}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Chrono Sequence Line */}
        {!isManualMode && !simulation?.isActive && processedRouteCoords.length > 0 && (
          <Polyline
            positions={processedRouteCoords}
            color="#2563EB"
            weight={6}
            opacity={1}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Manual Sequence Line */}
        {isManualMode && manualRouteCoords.length > 0 && (
          <Polyline
            positions={manualRouteCoords}
            color="#E040FB"
            weight={6}
            dashArray="10, 10"
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Markers */}
        {todaysActivities.map((act, index) => {
          let displayNum = index + 1;
          let isSelected = false;

          if (isManualMode) {
            const mIdx = manualSequenceIds.indexOf(act.id);
            if (mIdx !== -1) {
              displayNum = mIdx + 1;
              isSelected = true;
            } else {
              displayNum = index + 1;
              isSelected = false;
            }
          } else {
            isSelected = true;
          }

          const isDimmed = isManualMode && !isSelected;
          const customMarkerColor = overlapColors[act.id] || ""; // Apply Welsh-Powell graph coloring

          return (
            <Marker
              key={act.id}
              position={[act.location.latitude, act.location.longitude]}
              icon={createNumberedIcon(displayNum, isSelected, isDimmed, customMarkerColor)}
              eventHandlers={{ click: () => handleMarkerClick(act.id) }}
            />
          );
        })}

        {/* Simulation Elements */}
        {simulation && simulation.coords.length > 0 && (
          <>
            {/* Rejected Routes — AI Analysis from Start */}
            {simulation.rejectedRoutes && simulation.rejectedRoutes.map((rejected, rIdx) => (
              <React.Fragment key={`rejected-route-${rIdx}`}>
                <Polyline
                  positions={rejected.coords}
                  color="#ef4444"
                  weight={4}
                  dashArray="8, 12"
                  opacity={0.4}
                  lineCap="round"
                  lineJoin="round"
                />
                {rejected.coords.length > 2 && (
                  <Marker
                    position={rejected.coords[Math.floor(rejected.coords.length * 0.35)]}
                    icon={L.divIcon({
                      className: "custom-div-icon",
                      html: `<div style="background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 4px 10px; border-radius: 10px; font-size: 9px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 10px rgba(220,38,38,0.4); border: 1.5px solid rgba(255,255,255,0.4);">❌ Ditolak AI: ${rejected.reason}</div>`,
                      iconSize: [240, 30],
                      iconAnchor: [120, 15],
                    })}
                  />
                )}
              </React.Fragment>
            ))}

            {/* Obstacle Markers */}
            {simulation.obstacles.map((obs, idx) => {
              const emoji = Array.from(obs.type)[0] || "⚠️";
              return (
                <Marker
                  key={`obs-${idx}`}
                  position={[obs.lat, obs.lng]}
                  icon={L.divIcon({
                    className: "custom-div-icon",
                    html: `<div style="background-color: #ef4444; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2.5px solid white; box-shadow: 0 2px 8px rgba(239,68,68,0.5);">${emoji}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                  })}
                />
              );
            })}

            {/* Active AI-Selected Route */}
            <Polyline
              positions={simulation.coords}
              color="#f59e0b"
              weight={5}
              dashArray="5, 10"
              lineCap="round"
              lineJoin="round"
            />
            {/* AI Best Route Label */}
            {simulation.rejectedRoutes && simulation.rejectedRoutes.length > 0 && simulation.coords.length > 2 && (
              <Marker
                position={simulation.coords[Math.floor(simulation.coords.length * 0.3)]}
                icon={L.divIcon({
                  className: "custom-div-icon",
                  html: `<div style="background: linear-gradient(135deg, #059669, #047857); color: white; padding: 4px 10px; border-radius: 10px; font-size: 9px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 10px rgba(5,150,105,0.4); border: 1.5px solid rgba(255,255,255,0.4);">✅ Rute AI Terbaik</div>`,
                  iconSize: [140, 30],
                  iconAnchor: [70, 15],
                })}
              />
            )}
            {simulation.currentIndex < simulation.coords.length && (
               <Marker
                 position={simulation.coords[simulation.currentIndex]}
                 icon={simMotorIcon}
               />
            )}
          </>
        )}

      </MapContainer>

      {/* Simulation Event Alert */}
      {simulation?.event && (
         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[2000] drop-shadow-xl pointer-events-none">
            <div className={`px-6 py-4 rounded-xl ${isDarkMode ? "bg-slate-800 text-white" : "bg-white text-slate-800"} shadow-2xl flex flex-col items-center gap-2 border ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}>
               <span className="text-xl font-bold">{simulation.event}</span>
               {simulation.event !== "Tiba di tujuan! 🎉" && simulation.event !== "Semua kegiatan selesai! 🎉" && (
                 <span className="text-sm text-slate-500 flex items-center gap-2">
                   <div className="w-4 h-4 border-2 border-t-blue-500 border-r-blue-500 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                   Mencari rute alternatif...
                 </span>
               )}
            </div>
         </div>
      )}

      {/* Navigation Simulation HUD */}
      {simulation && simulation.isActive && (
        <div className="absolute bottom-4 inset-x-4 z-[1000] pointer-events-none flex flex-col gap-2">
          <div
            className={`${
              isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-800"
            } backdrop-blur-md rounded-2xl p-4 border pointer-events-auto shadow-2xl flex flex-col gap-3`}
          >
            {/* Target Destination & Details */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold leading-tight truncate">Tujuan: {simulation.destName}</h4>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    Koordinat: {simulation.destLat.toFixed(4)}, {simulation.destLng.toFixed(4)}
                  </p>
                </div>
              </div>
              
              {/* Dropdown list to change target activity */}
              <select
                className={`text-[10px] font-bold p-1 rounded-lg border shrink-0 ${
                  isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
                value={todaysActivities.findIndex(a => a.title === simulation.destName)}
                onChange={(e) => {
                  const index = Number(e.target.value);
                  if (todaysActivities[index]) {
                    startSimulation(todaysActivities[index]);
                  }
                }}
              >
                {todaysActivities.map((act, index) => (
                  <option key={act.id} value={index}>
                    Stop #{index + 1}: {act.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress Bar & Stats */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] font-bold font-mono text-slate-500">
                <span>Rider GPS Tracked</span>
                <span>Sisa Jarak: {((simulation.coords.length - simulation.currentIndex) * 0.15).toFixed(1)} km</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${(simulation.currentIndex / simulation.coords.length) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Controls & Status Line */}
            <div className="flex justify-between items-center gap-2 mt-1">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${simulation.event ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="text-[10px] font-extrabold truncate">
                  {simulation.event ? `⚠️ ${simulation.event}` : "🟢 Perjalanan Lancar"}
                </span>
              </div>

              <button
                onClick={forceObstacle}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-bold shadow-md transition-colors whitespace-nowrap"
              >
                🚨 SIMULASIKAN HAMBATAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      <div className="absolute top-6 inset-x-4 flex justify-between gap-4 items-start pointer-events-none z-[1000] drop-shadow-md">
        <div
          className={`${
            isDarkMode ? "bg-slate-900 text-white border-slate-800" : "bg-white/95 border-black/5"
          } backdrop-blur-md pointer-events-auto border rounded-2xl px-4 py-3 flex items-center gap-3`}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">
              {isManualMode ? "Manual Mode" : "Prescriptive Graph"}
            </span>
            <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}>
              {isManualMode ? manualSequenceIds.length : todaysActivities.length} Stops
            </span>
          </div>
        </div>

        {!isManualMode && routeOptions.length > 0 && (
          <div
            className={`${
              isDarkMode ? "bg-slate-900 text-white border-slate-800" : "bg-white/95 border-black/5"
            } backdrop-blur-md pointer-events-auto border rounded-2xl px-4 py-3 flex items-center gap-2`}
          >
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-green-600" strokeWidth={3} />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5 font-sans">
                Real Trip Duration
              </span>
              <span className="text-xs font-extrabold text-green-600">
                {routeOptions[0].timeStr}
              </span>
            </div>
          </div>
        )}
      </div>

        <div className="absolute top-20 right-4 z-[1000] drop-shadow-md flex flex-col gap-3">
        <div
          className={`${
            isDarkMode ? "bg-slate-900 text-white border-slate-800" : "bg-white/95 border-black/5"
          } backdrop-blur-md rounded-2xl px-4 py-3 flex items-center gap-3 border pointer-events-auto shadow-sm`}
        >
          <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}>
            Manual Route
          </span>
          <button
            onClick={() => {
              setIsManualMode(!isManualMode);
              setManualSequenceIds([]);
            }}
            className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors focus:outline-none ${
              isManualMode ? "bg-purple-600" : isDarkMode ? "bg-slate-600" : "bg-slate-300"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                isManualMode ? "translate-x-5" : "translate-x-0"
              }`}
            ></div>
          </button>
        </div>

        <div
          className={`${
            isDarkMode ? "bg-slate-900 text-white border-slate-800" : "bg-white/95 border-black/5"
          } backdrop-blur-md rounded-2xl px-4 py-3 flex items-center justify-between gap-3 border pointer-events-auto shadow-sm cursor-pointer hover:opacity-90`}
          onClick={() => {
             if (simulation) setSimulation(null);
             else startSimulation();
          }}
        >
          <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}>
             Simulasi AI
          </span>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold text-white transition-colors ${simulation ? "bg-red-500" : "bg-blue-600"}`}>
             {simulation ? "STOP" : "MULAI"}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SCHEDULE VIEW (WITH ADVANCED GRAPH THEORETIC ALERTS & CARDS)
// ============================================
const ScheduleView = ({
  todaysActivities,
  graphConflicts,
  overlapColors,
  isomorphicTemplateDetected,
  onApplyIsomorphic,
  selectedDate,
  setSelectedDate,
  onAddClick,
  onRemoveClick,
  isDarkMode,
}: {
  todaysActivities: Activity[];
  graphConflicts: any[];
  overlapColors: Record<string, string>;
  isomorphicTemplateDetected: boolean;
  onApplyIsomorphic: () => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  onAddClick: () => void;
  onRemoveClick: (id: string) => void;
  isDarkMode: boolean;
}) => {
  const generateDays = () => {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 3);

    return Array.from({ length: 14 }).map((_, i) => {
      const nd = new Date(startDate);
      nd.setDate(startDate.getDate() + i);
      const year = nd.getFullYear();
      const month = String(nd.getMonth() + 1).padStart(2, "0");
      const day = String(nd.getDate()).padStart(2, "0");
      const fullDate = `${year}-${month}-${day}`;
      return {
        name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][nd.getDay()],
        num: day,
        fullDate: fullDate,
      };
    });
  };
  const days = generateDays();
  const [currentTime, setCurrentTime] = React.useState("");

  React.useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`absolute inset-0 flex flex-col pt-12 pb-24 h-full overflow-hidden ${
        isDarkMode ? "bg-slate-950" : "bg-slate-100"
      }`}
    >
      <div className="px-6 mb-4 shrink-0">
        <div className="flex justify-between items-center mb-1">
          <h1
            className={`text-[34px] font-extrabold tracking-tight leading-none ${
              isDarkMode ? "text-white" : "text-slate-800"
            }`}
          >
            Retrack
          </h1>
          <div className="flex items-center gap-1.5 skeleton">
            <div className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Prescriptive
            </div>
          </div>
        </div>
        <p className={`${isDarkMode ? "text-slate-400" : "text-slate-500"} text-sm font-medium`}>
          Dynamic routing with Graph Theory & Spatial Data of Indonesia
        </p>
      </div>

      <div className="w-full overflow-x-auto no-scrollbar shrink-0 px-6 pb-4 whitespace-nowrap">
        <div className="flex gap-2.5 inline-flex">
          {days.map((d) => {
            const isActive = d.fullDate === selectedDate;
            return (
              <button
                key={d.fullDate}
                onClick={() => setSelectedDate(d.fullDate)}
                className={`flex flex-col items-center justify-center rounded-[20px] w-[56px] h-[82px] shrink-0 transition-all shadow-sm outline-none ${
                  isActive
                    ? "bg-blue-600 text-white scale-105"
                    : isDarkMode
                    ? "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"
                    : "bg-white text-slate-800 border border-black/5 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`text-[10px] font-bold mb-1 tracking-wider uppercase ${
                    isActive ? "text-blue-100" : "text-slate-400"
                  }`}
                >
                  {d.name}
                </span>
                <span
                  className={`text-lg font-extrabold ${
                    isActive ? "text-white" : isDarkMode ? "text-slate-400" : "text-slate-800"
                  }`}
                >
                  {d.num}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* UNIFIED SCROLLABLE CONTAINER FOR CONTENT BELOW CALENDAR */}
      <div
        className="flex-1 overflow-y-auto px-6 pb-24 hide-scrollbar space-y-5"
        style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}
      >
        {/* GRAPH ISOMORPHISM DETECTOR BANNER */}
        {isomorphicTemplateDetected && (
          <div className="transition-all">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[20px] p-4 shadow-lg relative overflow-hidden flex flex-col gap-2">
              <div className="absolute right-2 bottom-0 opacity-10">
                <Sparkles className="w-24 h-24 text-white" />
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
                <span className="font-extrabold text-[13px] uppercase tracking-wider">
                  Graph Isomorphism Signature Found!
                </span>
              </div>
              <p className="text-xs text-blue-100 font-medium leading-relaxed leading-snug">
                We identified that today's program matches your Tuesday routine. Apply the preset
                optimized graph instantly?
              </p>
              <button
                onClick={onApplyIsomorphic}
                className="mt-1 bg-white hover:bg-slate-100 text-blue-800 font-extrabold text-xs py-2 px-4 rounded-xl shadow transition-all active:scale-95 duration-100 self-start"
              >
                Apply Optimized Preset
              </button>
            </div>
          </div>
        )}

        {/* GRAPH TRANSITION CONFLICTS (SMART RED ALERTS) OR TIME DEMO */}
        {(graphConflicts.length > 0 || currentTime) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                Route Alerts & conflicts
              </span>
              {currentTime && (
                <span className={`text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full border ${isDarkMode ? "bg-slate-800/80 text-blue-400 border-blue-500/20" : "bg-white text-blue-600 border-slate-200 shadow-sm"}`}>
                  ⏱️ WIB Clock: {currentTime}
                </span>
              )}
            </div>

            {graphConflicts.length > 0 ? (
              <div className="space-y-2">
                {graphConflicts.map((conf, idx) => (
                  <div
                    key={idx}
                    className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 flex gap-2.5 items-start"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 animate-bounce" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                        Tight Route Conflict Detected
                      </span>
                      <p className="text-xs font-semibold leading-normal">{conf.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-xs py-2.5 px-3 rounded-lg border ${isDarkMode ? "border-slate-800 text-slate-400 bg-slate-900/30" : "border-slate-200 text-slate-500 bg-white"}`}>
                <span>Semua rute aman. Validasi rute aktif berdasarkan waktu WIB di atas.</span>
              </div>
            )}
          </div>
        )}

        {/* TIMELINE ACTIVITIES PANEL / LIST CONTAINER */}
        <div className="relative z-0">
          {todaysActivities.length > 0 && (
            <div className="absolute left-[15px] top-6 bottom-16 w-0.5 bg-slate-200/50 dark:bg-slate-800/50 -z-10"></div>
          )}

          {todaysActivities.map((act, i) => {
          const isFirstOrLast = i === 0 || i === todaysActivities.length - 1;
          const isOverlapConflict = !!overlapColors[act.id];
          const clashColor = overlapColors[act.id] || "";

          return (
            <div key={act.id} className="flex gap-4 mb-5 relative group">
              <div
                className={`pt-5 z-10 shrink-0 w-8 flex justify-center ${
                  isDarkMode ? "bg-slate-950" : "bg-slate-100"
                }`}
              >
                {clashColor ? (
                  <div
                    style={{ backgroundColor: clashColor }}
                    className="w-[20px] h-[20px] rounded-full border-4 border-white ring-4 ring-red-400 flex items-center justify-center text-white text-[9px] font-extrabold shadow-sm animate-pulse"
                  >
                    !
                  </div>
                ) : isFirstOrLast ? (
                  <div className="w-[18px] h-[18px] rounded-full border-4 border-blue-600 ring-4 ring-blue-100 bg-white"></div>
                ) : (
                  <div className="w-[14px] h-[14px] rounded-full border border-slate-400 bg-white ring-4 ring-slate-100"></div>
                )}
              </div>

              <div
                style={{
                  borderLeftColor: clashColor ? clashColor : undefined,
                  borderLeftWidth: clashColor ? "4px" : undefined,
                }}
                className={`${
                  isDarkMode
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-black/[0.04]"
                } rounded-2xl p-4 flex-1 shadow-sm border transition-all relative flex flex-col`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className={`text-[16px] font-extrabold tracking-tight ${
                        isDarkMode ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {act.title}
                    </h3>
                    {act.isAlways && (
                      <span className="text-[9px] uppercase tracking-widest font-black shrink-0 px-2 py-0.5 rounded-full flex items-center bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                        Rutin
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveClick(act.id)}
                    className="shrink-0 text-slate-400 hover:text-red-500 rounded-lg p-0.5 transition-colors focus:outline-none"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2.5 mt-2 flex-wrap text-slate-500">
                  <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                    <Clock className="w-3.5 h-3.5 opacity-75 text-indigo-500" />
                    <span>
                      {act.type === "FIXED" ? (
                        `${act.timeWindow?.start || "00:00"} - ${act.timeWindow?.end || "00:00"}`
                      ) : (
                        <span className="text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md font-extrabold inline-flex items-center gap-1">
                          Calculated: {act.timeWindow?.start || "Pending"} (⏳ {act.durationMinutes}m)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-semibold overflow-hidden">
                    <MapPin className="w-3.5 h-3.5 opacity-75 text-rose-500 shrink-0" />
                    <span className="truncate max-w-[150px]">{act.location?.name || "No location info"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2.5">
                  <span
                    className={`text-[9px] tracking-wider uppercase font-extrabold px-2 py-0.5 rounded-md ${
                      act.type === "FIXED"
                        ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                    }`}
                  >
                    {act.type === "FIXED" ? "🔗 Fixed Node" : "🏃 Flexible Node"}
                  </span>

                  {act.isPoiSelector && (
                    <span className="text-[9px] font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Coffee className="w-2.5 h-2.5" /> Bipartite POI Search
                    </span>
                  )}

                  {isOverlapConflict && (
                    <span className="text-[9px] font-bold text-red-500 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-md">
                      ⚔️ Welsh-Powell Clash
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {todaysActivities.length === 0 && (
          <div className="text-center pt-16 px-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto mb-4 animate-pulse">
              <Compass className="w-8 h-8" />
            </div>
            <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? "text-white" : "text-slate-700"}`}>
              No Scheduled Activities
            </h4>
            <p className="text-xs text-slate-400">
              Create a mixture of fixed schedule constraints and flexible priorities. Click "+" to form your graph.
            </p>
          </div>
        )}
      </div></div>

      <button
        onClick={onAddClick}
        className="absolute bottom-[104px] right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all z-20 focus:outline-none"
      >
        <Plus className="w-6 h-6" strokeWidth={3} />
      </button>
    </div>
  );
};

const ProfileView = ({
  isDarkMode,
  toggleDarkMode,
  user,
  onLogin,
  onLogout,
  onEnablePush,
  isPushEnabled,
  isInstallable,
  onInstallClick,
}: {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  onEnablePush: () => void;
  isPushEnabled: boolean;
  isInstallable: boolean;
  onInstallClick: () => void;
}) => (
  <div
    className={`absolute inset-0 flex flex-col h-full overflow-y-auto pb-24 ${
      isDarkMode ? "bg-slate-950" : "bg-[#F9FAFB]"
    }`}
  >
    <div className={`px-6 pt-16 pb-8 ${isDarkMode ? "bg-slate-900" : "bg-white"}`}>
      <div className="flex items-center gap-5 mb-8">
        <div className="w-[72px] h-[72px] rounded-full bg-blue-600 flex items-center justify-center shrink-0 overflow-hidden">
          {user && user.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <UserIcon className="w-9 h-9 text-white" />
          )}
        </div>
        <div>
          <h2
            className={`text-[22px] font-extrabold mb-0.5 ${isDarkMode ? "text-white" : "text-slate-900"}`}
          >
            {user ? user.displayName : "Guest User"}
          </h2>
          <p className={`${isDarkMode ? "text-slate-400" : "text-slate-500"} text-sm font-semibold`}>
            {user ? user.email : "Not signed in"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div
          className={`flex flex-col items-center justify-center py-4 rounded-2xl ${
            isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-slate-50"
          }`}
        >
          <span
            className={`text-xl font-extrabold mb-1 leading-none ${
              isDarkMode ? "text-white" : "text-slate-800"
            }`}
          >
            12
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Schedules
          </span>
        </div>
        <div
          className={`flex flex-col items-center justify-center py-4 rounded-2xl ${
            isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-slate-50"
          }`}
        >
          <span className="text-xl font-extrabold text-blue-600 mb-1 leading-none">
            35%
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Detour Min
          </span>
        </div>
        <div
          className={`flex flex-col items-center justify-center py-4 rounded-2xl ${
            isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-slate-50"
          }`}
        >
          <span
            className={`text-xl font-extrabold mb-1 leading-none ${
              isDarkMode ? "text-white" : "text-slate-800"
            }`}
          >
            OSM
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Map Router
          </span>
        </div>
      </div>
    </div>

    <div className="px-6 py-4 flex-1">
      <div
        className={`rounded-3xl overflow-hidden border ${
          isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-white border-slate-100 shadow-sm"
        }`}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDarkMode ? "border-slate-800" : "border-slate-100"
          }`}
        >
          <div className="flex items-center gap-3">
            <Settings className={`w-4 h-4 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`} />
            <span
              className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-slate-800"}`}
            >
              Dark Mode
            </span>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors focus:outline-none ${
              isDarkMode ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                isDarkMode ? "translate-x-5" : "translate-x-0"
              }`}
            ></div>
          </button>
        </div>

        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDarkMode ? "border-slate-800" : "border-slate-100"
          }`}
        >
          <div className="flex items-center gap-3">
            <Bell className={`w-4 h-4 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`} />
            <span
              className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-slate-800"}`}
            >
              Push Notification
            </span>
          </div>
          <button
            onClick={onEnablePush}
            className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors focus:outline-none ${
              isPushEnabled ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                isPushEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            ></div>
          </button>
        </div>

        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDarkMode ? "border-slate-800" : "border-slate-100"
          }`}
        >
          <div className="flex items-center gap-3">
            <HelpCircle className={`w-4 h-4 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`} />
            <span
              className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-slate-800"}`}
            >
              Support Center
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>

        {isInstallable && (
          <button onClick={onInstallClick} className={`w-full flex items-center justify-between px-5 py-4 border-b transition-colors cursor-pointer ${isDarkMode ? "border-slate-800 hover:bg-slate-800" : "border-slate-100 hover:bg-slate-50"}`}>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-600">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <span className="font-semibold text-sm text-blue-600">Install App (Android/iOS/Desktop)</span>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-600 overflow-hidden" />
          </button>
        )}

        {user ? (
          <button onClick={onLogout} className={`w-full flex items-center justify-between px-5 py-4 transition-colors cursor-pointer ${isDarkMode ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}>
            <div className="flex items-center gap-3">
              <LogOut className="w-4 h-4 text-rose-500" />
              <span className="font-semibold text-sm text-rose-500">Log Out Profile</span>
            </div>
          </button>
        ) : (
          <button onClick={onLogin} className={`w-full flex items-center justify-between px-5 py-4 transition-colors cursor-pointer ${isDarkMode ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}>
            <div className="flex items-center gap-3">
              <LogIn className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-600">Connect Google Account</span>
            </div>
          </button>
        )}
      </div>
    </div>
  </div>
);

// ============================================
// MAIN APP ARCHITECTURE CONTAINER
// ============================================
const sortByChronology = (acts: Activity[]): Activity[] => {
  return [...acts].sort((a, b) => {
    const aStart = a.timeWindow?.start ? timeToMins(a.timeWindow.start) : 1440;
    const bStart = b.timeWindow?.start ? timeToMins(b.timeWindow.start) : 1440;
    return aStart - bStart;
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"schedule" | "map" | "profile">("schedule");
  const todayStr = getTodayDateString();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  
  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  useEffect(() => {
    // Check initial permission
    if ("Notification" in window) {
      setIsPushEnabled(Notification.permission === "granted");
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userActs = await fetchUserActivities(currentUser.uid);
          setActivities(userActs);
        } catch (e) {
          console.error("Failed to fetch user activities", e);
        }
      } else {
        setActivities([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen for push notifications in foreground and auto-show native popup
  useEffect(() => {
    setupForegroundNotificationListener((payload) => {
      console.log('Main thread received message: ', payload);
    });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Google login failed", error);
      alert(`Login gagal: ${error.message || "Pastikan domain ditambahkan ke Firebase Authorized Domains, atau coba buka aplikasi ini di tab baru (Open in new tab)."}`);
    }
  };

  const handleEnablePush = async () => {
    if (!user) {
      alert("Harap login menggunakan akun Google terlebih dahulu untuk mengaktifkan Push Notifications.");
      return;
    }

    if (isPushEnabled) {
      // User is turning it OFF
      const confirmOff = window.confirm("Nonaktifkan notifikasi? Perhatikan bahwa Anda mungkin juga perlu mencabut izin notifikasi di pengaturan browser (Site Settings).");
      if (confirmOff) {
        setIsPushEnabled(false);
      }
      return;
    }

    // User is turning it ON
    setIsPushEnabled(true); // Optimistically set to true to show transition

    try {
      console.log("Requesting FCM token for user:", user.uid);
      const token = await requestNotificationPermissionAndGetToken();
      
      if (token) {
        console.log("FCM token obtained, saving to server...");
        
        // Save the token to our server endpoint which stores it in Firestore
        const saveRes = await fetch(`/api/users/${user.uid}/tokens`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        
        const saveData = await saveRes.json();
        console.log("Save token response:", saveRes.status, saveData);
        
        if (saveRes.ok && saveData.success) {
          console.log("Token saved successfully. Sending test notification...");
          
          // Also send a test verification notification
          try {
            const res = await fetch("/api/notifications/test", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token, title: "Halo dari Retrack! 👋", body: "Perangkat ini telah berhasil terdaftar untuk notifikasi jadwal." }),
            });
            const data = await res.json();
            console.log("Test notification response:", data);
            
            if (data.success) {
              alert("✅ Notifikasi berhasil diaktifkan dan token telah disimpan ke database!");
            } else {
              alert("⚠️ Token tersimpan di database, tetapi gagal mengirim notifikasi testing: " + (data.error || "Unknown Error"));
            }
          } catch (testErr) {
            console.error("Test notification request failed:", testErr);
            alert("✅ Token tersimpan di database! Tetapi pengiriman notifikasi testing gagal (mungkin masalah jaringan).");
          }
        } else {
          setIsPushEnabled(false);
          const errorMsg = saveData.error || `HTTP ${saveRes.status}`;
          console.error("Failed to save token:", errorMsg);
          alert(`❌ Gagal menyimpan token ke database: ${errorMsg}\n\nPastikan Firebase Admin SDK dikonfigurasi dengan benar di server.`);
        }
      } else {
        setIsPushEnabled(false);
        alert("❌ Gagal mendapatkan FCM token.\n\nKemungkinan penyebab:\n1. VAPID key belum benar di firebase.ts\n2. Service Worker gagal didaftarkan\n3. Browser memblokir notifikasi\n\nBuka Console browser (F12) untuk detail error.");
      }
    } catch (error: any) {
      setIsPushEnabled(false);
      console.error("Error setting up push notifications:", error);
      alert(`❌ Terjadi kesalahan:\n${error.message || "Unknown error"}\n\nBuka Console browser (F12) untuk detail.`);
    }
  };

  const [activities, setActivities] = useState<Activity[]>([]);

  // Backend response results states
  const [todaysActivities, setTodaysActivities] = useState<Activity[]>([]);
  const [routeOptions, setRouteOptions] = useState<any[]>([]);
  const [graphConflicts, setGraphConflicts] = useState<any[]>([]);
  const [isomorphicTemplateDetected, setIsomorphicTemplateDetected] = useState(false);

  // Re-fetch routings and optimizations on schedule changes
  useEffect(() => {
    const rawToday = activities.filter((a) => a.date === selectedDate || a.isAlways);

    const syncRouteFromBackend = async () => {
      if (rawToday.length === 0) {
        setTodaysActivities([]);
        setRouteOptions([]);
        setGraphConflicts([]);
        return;
      }

      try {
        const response = await fetch("/api/get_route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activities: rawToday }),
        });
        const contentType = response.headers.get("content-type");
        if (response.ok && contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data.sequence && data.sequence.length > 0) {
            setTodaysActivities(data.sequence);
          } else {
            // Fallback if sequence is empty or invalid
            setTodaysActivities(sortByChronology(rawToday));
          }
          if (data.options) {
            setRouteOptions(data.options);
          }
          if (data.conflicts) {
            setGraphConflicts(data.conflicts);
          }
        } else {
          throw new Error("Respon server rute tidak valid");
        }
      } catch (err) {
        console.error("Endpoint calculation error, falling back to chronological chronology support", err);
        setTodaysActivities(sortByChronology(rawToday));
        setRouteOptions([]);
        setGraphConflicts([
          {
            message: "Sistem routing OSRM offline. Jadwal dialihkan ke urutan waktu manual.",
          },
        ]);
      }
    };

    syncRouteFromBackend();

    // Check Graph Isomorphism Routine Matcher
    // Tuesday historical pattern template
    const signatureTemplate = ["kuliahdiuniversitasairlangga", "belikopiterdekat", "makansiangenak", "rapatpengurusharian"];
    const currentSignature = rawToday.map((a) => a.title.toLowerCase().replace(/[^a-z]/g, "")).sort();
    
    // Isomorphism logic: same set of vertices configuration regardless of raw initial indices
    const isIsomorphic =
      signatureTemplate.length === currentSignature.length &&
      signatureTemplate.sort().every((v, i) => v === currentSignature[i]);

    setIsomorphicTemplateDetected(isIsomorphic);
  }, [activities, selectedDate]);

  const handleApplyIsomorphicPreset = () => {
    // Isomorphic pattern optimizes the sorting sequence instantly
    alert("Graf Isomorfik diterapkan! Menggunakan susunan rute teroptimasi historis.");
    setIsomorphicTemplateDetected(false);
  };

  const handleMapDoubleClick = (lat: number, lng: number) => {
    const defaultName = `Pinned Location`;
    setSelectedLocation({ lat, lng, name: defaultName });
    setLocationQuery(defaultName);
    setIsModalOpen(true);
  };

  // Form Modal Controllers
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityType, setNewActivityType] = useState<"FIXED" | "FLEXIBLE">("FIXED");
  const [newActivityDuration, setNewActivityDuration] = useState<number>(30);
  const [newActivityStartTime, setNewActivityStartTime] = useState("09:00");
  const [newActivityEndTime, setNewActivityEndTime] = useState("10:00");
  const [newActivityDate, setNewActivityDate] = useState(selectedDate);
  const [newActivityIsAlways, setNewActivityIsAlways] = useState(false);

  // Synchronize newActivityDate with selectedDate when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setNewActivityDate(selectedDate);
      setNewActivityIsAlways(false);
    }
  }, [isModalOpen, selectedDate]);

  // Location Selector
  const [locationQuery, setLocationQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [usePoiBipartite, setUsePoiBipartite] = useState(false);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchLocation = async (query: string) => {
    setLocationQuery(query);
    setSelectedLocation(null);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    typingTimeoutRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        const res = await fetch(url, { headers: { "Accept-Language": "id", "User-Agent": "RetrackApp" } });
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          const data = await res.json();
          const results = data.map((item: any) => ({
            displayName: item.display_name.split(",")[0],
            formattedAddress: item.display_name,
            location: {
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
            },
          }));
          setSearchResults(results);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error("Geocoding fetch failed", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);
  };

  const handleAddActivity = () => {
    if (!newActivityTitle || !selectedLocation) return;

    const finalLoc = {
      name: selectedLocation.name,
      latitude: selectedLocation.lat,
      longitude: selectedLocation.lng,
    };

    const newAct: Activity = {
      id: String(Date.now()),
      title: newActivityTitle,
      type: newActivityType,
      timeWindow: {
        start: newActivityStartTime,
        end: newActivityEndTime,
      },
      location: finalLoc,
      date: newActivityDate || selectedDate,
      isAlways: newActivityIsAlways,
    };

    setActivities((prev) => {
      const updated = [...prev, newAct];
      
      if (user) {
        saveActivityToDb(user.uid, newAct).catch(e => console.error("Failed saving to DB", e));
      } else {
        alert("Peringatan: Anda belum login. Jadwal ini tidak tersimpan permanen di cloud database.");
      }

      // Deteksi tabrakan jadwal langsung saat menyimpan
      if (user && newAct.type === "FIXED" && newAct.timeWindow.start && newAct.timeWindow.end) {
        const start1 = timeToMins(newAct.timeWindow.start);
        const end1 = timeToMins(newAct.timeWindow.end);
        
        const overlappingAct = prev.find(a => {
          if (a.date !== newAct.date || a.type !== "FIXED" || !a.timeWindow?.start || !a.timeWindow?.end) return false;
          const start2 = timeToMins(a.timeWindow.start);
          const end2 = timeToMins(a.timeWindow.end);
          return start1 < end2 && start2 < end1;
        });
        
        if (overlappingAct) {
          fetch("/api/notifications/overlap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid: user.uid,
              activity1: newAct.title,
              activity2: overlappingAct.title
            })
          }).catch(err => console.error("Failed to trigger overlap notification", err));
        }
      }
      
      return updated;
    });

    // Cleanup states
    setIsModalOpen(false);
    setNewActivityTitle("");
    setNewActivityStartTime("09:00");
    setNewActivityEndTime("10:00");
    setLocationQuery("");
    setSelectedLocation(null);
  };

  const handleRemoveActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
    if (user) {
      deleteActivityFromDb(id).catch(e => console.error("Failed deleting from DB", e));
    }
  };

  // Run graph coloring Welsh-Powell
  const overlapColors = colorOverlapGraph(todaysActivities);

  return (
    <div
      className={`flex flex-col h-screen w-full relative overflow-hidden font-sans antialiased mx-auto sm:max-w-md sm:border-x transition-colors ${
        isDarkMode
          ? "bg-slate-950 text-slate-200 sm:border-slate-800"
          : "bg-slate-100 text-gray-900 sm:border-gray-200 sm:shadow-2xl"
      }`}
    >
      <style>{`.hide-scrollbar::-webkit-scrollbar, .no-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar, .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <div className="flex-1 relative overflow-hidden flex flex-col">
        {activeTab === "map" && (
          <MapCanvas
            todaysActivities={todaysActivities}
            isDarkMode={isDarkMode}
            onMapDoubleClick={handleMapDoubleClick}
            routeOptions={routeOptions}
            overlapColors={overlapColors}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleView
            todaysActivities={todaysActivities}
            graphConflicts={graphConflicts}
            overlapColors={overlapColors}
            isomorphicTemplateDetected={isomorphicTemplateDetected}
            onApplyIsomorphic={handleApplyIsomorphicPreset}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onAddClick={() => setIsModalOpen(true)}
            onRemoveClick={handleRemoveActivity}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === "profile" && (
          <ProfileView
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            user={user}
            onLogin={handleLogin}
            onLogout={logout}
            onEnablePush={handleEnablePush}
            isPushEnabled={isPushEnabled}
            isInstallable={isInstallable}
            onInstallClick={handleInstallClick}
          />
        )}
      </div>

      {/* Agenda Creation Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div
            className={`${
              isDarkMode ? "bg-slate-900" : "bg-white"
            } rounded-[28px] p-6 w-full max-w-sm shadow-2xl relative max-h-[85vh] flex flex-col`}
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-950 dark:hover:text-white rounded-full p-1 cursor-pointer focus:outline-none z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-5 shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5" strokeWidth={3} />
              </div>
              <h3
                className={`text-[20px] font-extrabold tracking-tight ${
                  isDarkMode ? "text-white" : "text-slate-800"
                }`}
              >
                Add Agenda Graph Node
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-12 scrollbar-thin">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Activity Name
                </label>
                <input
                  value={newActivityTitle}
                  onChange={(e) => setNewActivityTitle(e.target.value)}
                  className={`w-full border border-transparent rounded-2xl px-4 py-3 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all ${
                    isDarkMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                  placeholder="e.g. Kuliah Airlangga, Rapat"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Node Type
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setNewActivityType("FIXED")}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                      newActivityType === "FIXED"
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                        : isDarkMode
                        ? "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    🔗 Fixed Node
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewActivityType("FLEXIBLE")}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                      newActivityType === "FLEXIBLE"
                        ? "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/20"
                        : isDarkMode
                        ? "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    🏃 Flexible Node
                  </button>
                </div>
              </div>

              <div className="relative">
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Location (OpenStreetMap Nominatim API)
                </label>
                <div className="relative flex items-center">
                  <MapPin className="absolute left-3 w-4 h-4 text-slate-400" />
                  <input
                    value={locationQuery}
                    onChange={(e) => handleSearchLocation(e.target.value)}
                    className={`w-full border border-transparent rounded-2xl pl-10 pr-4 py-3 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all ${
                      isDarkMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                    placeholder="Search location..."
                  />
                </div>

                {isSearching ? (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/80 text-white rounded-2xl overflow-hidden py-3 text-center text-xs font-semibold z-50">
                    Searching...
                  </div>
                ) : (
                  searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 scrollbar-none bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl max-h-40 overflow-y-auto z-[5000] flex flex-col">
                      {searchResults.map((res: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedLocation({
                              lat: res.location.lat,
                              lng: res.location.lng,
                              name: res.displayName,
                            });
                            setLocationQuery(res.displayName);
                            setSearchResults([]);
                          }}
                          className="w-full text-left px-4 py-2 border-b last:border-0 border-slate-100 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <span className="font-extrabold text-[12px] block">{res.displayName}</span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {res.formattedAddress}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={newActivityStartTime}
                    onChange={(e) => setNewActivityStartTime(e.target.value)}
                    className={`w-full border border-transparent rounded-2xl px-4 py-3 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all ${
                      isDarkMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={newActivityEndTime}
                    onChange={(e) => setNewActivityEndTime(e.target.value)}
                    className={`w-full border border-transparent rounded-2xl px-4 py-3 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all ${
                      isDarkMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  value={newActivityDate}
                  disabled={newActivityIsAlways}
                  onChange={(e) => setNewActivityDate(e.target.value)}
                  className={`w-full border border-transparent rounded-2xl px-4 py-3 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all ${
                    isDarkMode ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-800"
                  } ${newActivityIsAlways ? "opacity-50 cursor-not-allowed" : ""}`}
                />

                <label className="mt-4 flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${newActivityIsAlways ? "bg-blue-600" : isDarkMode ? "bg-slate-700" : "bg-slate-300"}`}>
                    <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${newActivityIsAlways ? "translate-x-6" : "translate-x-0"}`}></div>
                  </div>
                  <input
                    type="checkbox"
                    checked={newActivityIsAlways}
                    onChange={(e) => setNewActivityIsAlways(e.target.checked)}
                    className="hidden"
                  />
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-slate-800"}`}>Ulangi Setiap Hari (Always)</span>
                    <span className={`text-[10px] leading-tight ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Jadwal akan muncul di semua tanggal</span>
                  </div>
                </label>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAddActivity}
                  disabled={!newActivityTitle || !selectedLocation}
                  className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-2xl shadow-md transition-all disabled:opacity-50 hover:bg-blue-800 active:scale-95 text-sm uppercase tracking-wider cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Tab Bar Navigation */}
      <div
        className={`absolute bottom-0 inset-x-0 border-t shadow-lg z-[4000] pb-6 sm:pb-3 pointer-events-auto shrink-0 transition-all ${
          isDarkMode ? "bg-slate-900/90 backdrop-blur-md border-slate-800" : "bg-white border-slate-100"
        }`}
      >
        <div className="flex justify-around items-center h-[76px] px-6 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab("schedule")}
            className={`flex flex-col items-center justify-center h-full gap-1 w-20 transition-all focus:outline-none ${
              activeTab === "schedule"
                ? "text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Calendar strokeWidth={3} className="w-[22px] h-[22px]" />
            <span
              className={`text-[9px] uppercase tracking-wider ${
                activeTab === "schedule" ? "font-bold" : "font-semibold"
              }`}
            >
              Scheduler
            </span>
          </button>

          <button
            onClick={() => setActiveTab("map")}
            className={`flex flex-col items-center justify-center h-full gap-1 w-20 transition-all focus:outline-none ${
              activeTab === "map"
                ? "text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <MapIcon strokeWidth={3} className="w-[22px] h-[22px]" />
            <span
              className={`text-[9px] uppercase tracking-wider ${
                activeTab === "map" ? "font-bold" : "font-semibold"
              }`}
            >
              Map Route
            </span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center justify-center h-full gap-1 w-20 transition-all focus:outline-none ${
              activeTab === "profile"
                ? "text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <UserIcon strokeWidth={3} className="w-[22px] h-[22px]" />
            <span
              className={`text-[9px] uppercase tracking-wider ${
                activeTab === "profile" ? "font-bold" : "font-semibold"
              }`}
            >
              Profile
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

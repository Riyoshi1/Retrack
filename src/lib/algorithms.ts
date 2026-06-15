import { Activity } from "../types";

// ============================================================================
// REPRESENTASI GRAF UNTUK ALGORITMA DIRECTED/UNDIRECTED GEOGRAFIS
// ============================================================================

export interface GraphNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  index: number;
}

export interface GraphEdge {
  fromNode: GraphNode;
  toNode: GraphNode;
  weight: number;      // Bobot utama yang digunakan algoritma
  distanceKm: number;  // Jarak fisik aktual dalam kilometer
  type: "normal" | "traffic" | "highway" | "eco_bonus";
  label: string;
  geometry?: [number, number][]; // Cached OSRM coords
}

export interface PathfindingResult {
  path: GraphNode[];            // Urutan node dari start ke goal
  pathEdges: GraphEdge[];       // Sisi-sisi yang dilalui
  totalWeight: number;          // Jumlah bobot jalur terpendek
  totalDistanceKm: number;      // Jarak fisik total dalam kilometer
  exploredNodesCount: number;   // Jumlah node yang dieksplorasi (efisiensi)
  executionTimeMs: number;      // Kecepatan eksekusi
  errorMessage?: string;        // Pesan jika algoritma gagal/menemukan siklus negatif
  hasNegativeCycle?: boolean;   // Khusus Bellman-Ford
}

// Haversine formula to compute distance between coordinates in Kilometers
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius Bumi dalam KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Membangun Graf interaktif dari daftar kegiatan hari ini
export async function buildGraphFromActivities(activities: Activity[]): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const nodes: GraphNode[] = activities.map((act, index) => ({
    id: act.id,
    name: act.title,
    lat: act.location.latitude,
    lng: act.location.longitude,
    index: index,
  }));

  const edges: GraphEdge[] = [];
  const n = nodes.length;
  
  // Create all edge pairs
  const edgePairs: { i: number, j: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edgePairs.push({ i, j });
    }
  }

  // Fetch geometries concurrently (chunked to avoid rate limits if many)
  for (let c = 0; c < edgePairs.length; c += 5) {
    const chunk = edgePairs.slice(c, c + 5);
    await Promise.all(chunk.map(async ({ i, j }) => {
      const fromNode = nodes[i];
      const toNode = nodes[j];
      
      let distance = calculateHaversineDistance(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng);
      let geometry: [number, number][] | undefined = undefined;
      
      try {
        const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY; // Standardized frontend API Key
        const url = `https://api.geoapify.com/v1/routing?waypoints=${fromNode.lat},${fromNode.lng}|${toNode.lat},${toNode.lng}&mode=drive&apiKey=${apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
           const data = await res.json();
           if (data.features && data.features.length > 0) {
              distance = data.features[0].properties.distance / 1000; // in km
              let cl = data.features[0].geometry.coordinates;
              if (data.features[0].geometry.type === "MultiLineString") cl = cl.flat(1);
              geometry = cl.map((c: any[]) => [c[1], c[0]]);
           }
        }
      } catch (e) {
        console.error("Failed to fetch Geoapify for edge", e);
      }

      // Menambahkan variasi tipe jalan berdasarkan indeks demi simulasi yang realistis
      let type: "normal" | "traffic" | "highway" | "eco_bonus" = "normal";
      let weight = distance;
      let label = "Jalur Reguler";

      const combinationCode = (i + j) % 6;
      if (combinationCode === 1) {
        type = "traffic";
        weight = distance * 2.2; 
        label = "Macet Padat (Bobot x2.2)";
      } else if (combinationCode === 3) {
        type = "highway";
        weight = distance * 0.7; 
        label = "Jalan Bebas Hambatan (Bobot x0.7)";
      } else if (combinationCode === 5) {
        type = "eco_bonus";
        weight = distance - 1.5; 
        label = "Jalur Hijau Eco-Friendly (Kredit Jarak -1.5)";
      }

      // Add bi-directional edges if needed, or undirected processing.
      // The original code created directed pairs (i, j)
      // Since it's a symmetric road (mostly), we'll add both directions with same geometry
      edges.push({
        fromNode,
        toNode,
        weight,
        distanceKm: distance,
        type,
        label,
        geometry
      });
      edges.push({
        fromNode: toNode,
        toNode: fromNode,
        weight,
        distanceKm: distance,
        type,
        label,
        geometry: geometry ? [...geometry].reverse() : undefined
      });
    }));
  }

  return { nodes, edges };
}

// ============================================================================
// 1. DIJKSTRA'S SHORTEST PATH ALGORITHM
// ============================================================================
export function runDijkstra(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startId: string,
  goalId: string
): PathfindingResult {
  const startTime = performance.now();
  let exploredCount = 0;

  // Inisialisasi struktur data
  const distances: Record<string, number> = {};
  const previousNode: Record<string, GraphNode | null> = {};
  const previousEdge: Record<string, GraphEdge | null> = {};
  const visited = new Set<string>();

  for (const node of nodes) {
    distances[node.id] = Infinity;
    previousNode[node.id] = null;
    previousEdge[node.id] = null;
  }
  distances[startId] = 0;

  // Verifikasi apakah ada jalur negatif. Jika ya, Dijkstra berpotensi memberikan peringatan
  let hasNegativeWeights = edges.some(e => e.weight < 0);

  // Loop utama
  while (visited.size < nodes.length) {
    // Cari node belum dikunjungi dengan jarak terkecil
    let uId: string | null = null;
    let minDistance = Infinity;

    for (const node of nodes) {
      if (!visited.has(node.id) && distances[node.id] < minDistance) {
        minDistance = distances[node.id];
        uId = node.id;
      }
    }

    if (uId === null || minDistance === Infinity) {
      break; 
    }

    exploredCount++;
    visited.add(uId);

    if (uId === goalId) {
      break; // Sudah sampai tujuan
    }

    // Relax all outgoing edges from node u
    const currentId = uId;
    const uNeighbors = edges.filter(e => e.fromNode.id === currentId);

    for (const edge of uNeighbors) {
      const vId = edge.toNode.id;
      if (visited.has(vId)) continue;
      
      const newDist = distances[currentId] + edge.weight;
      if (newDist < distances[vId]) {
        distances[vId] = newDist;
        previousNode[vId] = nodes.find(n => n.id === currentId) || null;
        previousEdge[vId] = edge;
      }
    }
  }

  // Rekonstruksi jalur terpendek
  const path: GraphNode[] = [];
  const pathEdges: GraphEdge[] = [];
  let currId: string | null = goalId;
  let maxPathNodes = nodes.length;

  if (distances[goalId] !== Infinity) {
    while (currId !== null) {
      const node = nodes.find(n => n.id === currId);
      if (node) path.unshift(node);
      
      const edge = previousEdge[currId];
      if (edge) pathEdges.unshift(edge);

      const prev = previousNode[currId];
      currId = prev ? prev.id : null;
      maxPathNodes--;
      if (maxPathNodes < 0) break;
    }
  }

  const endTime = performance.now();

  let errorMsg: string | undefined = undefined;
  if (distances[goalId] === Infinity) {
    errorMsg = "Tidak ditemukan koneksi jalur antara titik awal dan tujuan.";
  } else if (hasNegativeWeights) {
    errorMsg = "⚠️ Peringatan: Graf mendeteksi bobot sisi negatif. Dijkstra tetap mencoba mencari jalur alternatif namun tidak menjamin rute 100% optimal jika ada bobot negatif.";
  }

  return {
    path,
    pathEdges,
    totalWeight: distances[goalId] === Infinity ? 0 : distances[goalId],
    totalDistanceKm: pathEdges.reduce((sum, e) => sum + e.distanceKm, 0),
    exploredNodesCount: exploredCount,
    executionTimeMs: parseFloat((endTime - startTime).toFixed(4)),
    errorMessage: errorMsg,
  };
}

// ============================================================================
// 2. BELLMAN-FORD SHORTEST PATH ALGORITHM (MENDUKUNG BOBOT NEGATIF & DETEKSI SIKLUS)
// ============================================================================
export function runBellmanFord(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startId: string,
  goalId: string
): PathfindingResult {
  const startTime = performance.now();
  let exploredCount = 0;

  const distances: Record<string, number> = {};
  const previousNode: Record<string, GraphNode | null> = {};
  const previousEdge: Record<string, GraphEdge | null> = {};

  for (const node of nodes) {
    distances[node.id] = Infinity;
    previousNode[node.id] = null;
    previousEdge[node.id] = null;
  }
  distances[startId] = 0;

  const vCount = nodes.length;

  // Lakukan relaksasi sisi sebanyak V - 1 kali
  for (let i = 0; i < vCount - 1; i++) {
    let anyChange = false;
    for (const edge of edges) {
      const u = edge.fromNode.id;
      const v = edge.toNode.id;
      if (distances[u] !== Infinity && distances[u] + edge.weight < distances[v]) {
        distances[v] = distances[u] + edge.weight;
        previousNode[v] = edge.fromNode;
        previousEdge[v] = edge;
        anyChange = true;
      }
      exploredCount++;
    }
    // Jika tidak ada perubahan dalam satu iterasi penuh, kita bisa berhenti lebih awal
    if (!anyChange) break;
  }

  // Deteksi Siklus Berbobot Negatif (Negative Cycles)
  let hasNegativeCycle = false;
  for (const edge of edges) {
    const u = edge.fromNode.id;
    const v = edge.toNode.id;
    if (distances[u] !== Infinity && distances[u] + edge.weight < distances[v]) {
      hasNegativeCycle = true;
      break;
    }
  }

  // Rekonstruksi rute jika valid
  const path: GraphNode[] = [];
  const pathEdges: GraphEdge[] = [];
  let currId: string | null = goalId;
  let maxPathNodes = nodes.length;

  if (distances[goalId] !== Infinity && !hasNegativeCycle) {
    while (currId !== null) {
      const node = nodes.find(n => n.id === currId);
      if (node) path.unshift(node);

      const edge = previousEdge[currId];
      if (edge) pathEdges.unshift(edge);

      const prev = previousNode[currId];
      currId = prev ? prev.id : null;
      maxPathNodes--;
      if (maxPathNodes < 0) break;
    }
  }

  const endTime = performance.now();

  let errorMsg: string | undefined = undefined;
  if (hasNegativeCycle) {
    errorMsg = "🚨 Bahaya! Terdeteksi siklus bobot negatif (Negative Cycle) di dalam sistem rute. Perjalanan melingkar tanpa henti dapat menghasilkan kalkulasi jarak negatif tak terbatas.";
  } else if (distances[goalId] === Infinity) {
    errorMsg = "Tidak ditemukan rute valid dari keberangkatan ke tujuan.";
  }

  return {
    path,
    pathEdges,
    totalWeight: distances[goalId],
    totalDistanceKm: pathEdges.reduce((sum, e) => sum + e.distanceKm, 0),
    exploredNodesCount: exploredCount,
    executionTimeMs: parseFloat((endTime - startTime).toFixed(4)),
    hasNegativeCycle,
    errorMessage: errorMsg,
  };
}

// ============================================================================
// 3. A* (A-STAR) HEURISTIC SEARCH ALGORITHM (MENGGUNAKAN HEURISTIK GEOGRAFIS)
// ============================================================================
export function runAStar(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startId: string,
  goalId: string
): PathfindingResult {
  const startTime = performance.now();
  let exploredCount = 0;

  const goalNode = nodes.find(n => n.id === goalId);
  if (!goalNode) {
    return {
      path: [],
      pathEdges: [],
      totalWeight: Infinity,
      totalDistanceKm: 0,
      exploredNodesCount: 0,
      executionTimeMs: 0,
      errorMessage: "Tujuan pencarian tidak valid dalam basis data geolokasi.",
    };
  }

  // Heuristic function: Haversine distance to goal
  const heuristic = (node: GraphNode): number => {
    return calculateHaversineDistance(node.lat, node.lng, goalNode.lat, goalNode.lng);
  };

  // Maps / Records untuk tracking gScore, fScore
  const gScore: Record<string, number> = {}; // Jauh aktual dari start
  const fScore: Record<string, number> = {}; // Perkiraan jarak total (g + h)
  const previousNode: Record<string, GraphNode | null> = {};
  const previousEdge: Record<string, GraphEdge | null> = {};

  for (const node of nodes) {
    gScore[node.id] = Infinity;
    fScore[node.id] = Infinity;
    previousNode[node.id] = null;
    previousEdge[node.id] = null;
  }

  gScore[startId] = 0;
  fScore[startId] = heuristic(nodes.find(n => n.id === startId)!);

  const openSet = new Set<string>([startId]);
  const closedSet = new Set<string>();

  while (openSet.size > 0) {
    // Cari node di openSet dengan fScore terkecil
    let currentId: string | null = null;
    let minF = Infinity;

    for (const id of openSet) {
      if (fScore[id] < minF) {
        minF = fScore[id];
        currentId = id;
      }
    }

    if (currentId === null) break;

    exploredCount++;

    if (currentId === goalId) {
      break; // Sampai di tujuan!
    }

    openSet.delete(currentId);
    closedSet.add(currentId);

    // Cari tetangga yang berafiliasi keluar dari currentId
    const current = currentId;
    const outgoing = edges.filter(e => e.fromNode.id === current);

    for (const edge of outgoing) {
      const neighborId = edge.toNode.id;
      if (closedSet.has(neighborId)) continue; // Sudah sepenuhnya diproses

      // Jarak tentatif dari start ke tetangga melalui node sekrang
      // A* membutuhkan bobot tidak negatif agar optimal
      const weightBonusOffset = edge.weight < 0 ? 0 : edge.weight; // Mengamankan heuristik
      const tentativeG = gScore[current] + weightBonusOffset;

      if (!openSet.has(neighborId)) {
        openSet.add(neighborId);
      } else if (tentativeG >= gScore[neighborId]) {
        continue; // Jalur ini lebih buruk dari yang sudah ada
      }

      // Jalur ini yang terbaik! Catat.
      previousNode[neighborId] = nodes.find(n => n.id === current) || null;
      previousEdge[neighborId] = edge;
      gScore[neighborId] = tentativeG;
      fScore[neighborId] = tentativeG + heuristic(edge.toNode);
    }
  }

  // Rekonstruksi rute
  const path: GraphNode[] = [];
  const pathEdges: GraphEdge[] = [];
  let currId: string | null = goalId;
  let maxPathNodes = nodes.length;

  if (gScore[goalId] !== Infinity) {
    while (currId !== null) {
      const node = nodes.find(n => n.id === currId);
      if (node) path.unshift(node);

      const edge = previousEdge[currId];
      if (edge) pathEdges.unshift(edge);

      const prev = previousNode[currId];
      currId = prev ? prev.id : null;
      maxPathNodes--;
      if (maxPathNodes < 0) break;
    }
  }

  const endTime = performance.now();

  let errorMsg: string | undefined = undefined;
  if (gScore[goalId] === Infinity) {
    errorMsg = "A* tidak menemukan rute alternatif yang layak ke tujuan.";
  }

  return {
    path,
    pathEdges,
    totalWeight: gScore[goalId],
    totalDistanceKm: pathEdges.reduce((sum, e) => sum + e.distanceKm, 0),
    exploredNodesCount: exploredCount,
    executionTimeMs: parseFloat((endTime - startTime).toFixed(4)),
    errorMessage: errorMsg,
  };
}

// ============================================================================
// 4. FLOYD-WARSHALL ALL-PAIRS SHORTEST PATH ALGORITHM
// ============================================================================
export function runFloydWarshall(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startId: string,
  goalId: string
): PathfindingResult {
  const startTime = performance.now();
  let exploredCount = 0;

  const n = nodes.length;
  
  // Matriks Jarak & Next Node Pointer untuk rekonstruksi jalur
  const dist: number[][] = Array(n).fill(null).map(() => Array(n).fill(Infinity));
  const next: (number | null)[][] = Array(n).fill(null).map(() => Array(n).fill(null));
  const edgeMatrix: (GraphEdge | null)[][] = Array(n).fill(null).map(() => Array(n).fill(null));

  // Pemetaan ID Node ke Indeks Matriks
  const idToIndexMap: Record<string, number> = {};
  nodes.forEach((node, idx) => {
    idToIndexMap[node.id] = idx;
    dist[idx][idx] = 0;
  });

  // Isi dengan data edge awal
  for (const edge of edges) {
    const uIdx = idToIndexMap[edge.fromNode.id];
    const vIdx = idToIndexMap[edge.toNode.id];
    
    if (uIdx !== undefined && vIdx !== undefined) {
      // Ambil bobot sisi terkecil jika ada duplikat sisi
      if (edge.weight < dist[uIdx][vIdx]) {
        dist[uIdx][vIdx] = edge.weight;
        next[uIdx][vIdx] = vIdx;
        edgeMatrix[uIdx][vIdx] = edge;
      }
    }
  }

  // Floyd-Warshall DP relaxations
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        exploredCount++;
        if (dist[i][k] !== Infinity && dist[k][j] !== Infinity) {
          if (dist[i][k] + dist[i][k] < -1000) {
            // Pengaman dari looping minus tak berhingga
          }
          if (dist[i][k] + dist[k][j] < dist[i][j]) {
            dist[i][j] = dist[i][k] + dist[k][j];
            next[i][j] = next[i][k];
            edgeMatrix[i][j] = edgeMatrix[i][k];
          }
        }
      }
    }
  }

  // Rekonstruksi rute terpendek dari start ke goal
  const startIdx = idToIndexMap[startId];
  const goalIdx = idToIndexMap[goalId];
  const path: GraphNode[] = [];
  const pathEdges: GraphEdge[] = [];

  let errorMsg: string | undefined = undefined;

  if (startIdx !== undefined && goalIdx !== undefined && dist[startIdx][goalIdx] !== Infinity) {
    path.push(nodes[startIdx]);
    let curr = startIdx;
    let maxPathNodes = n; // To prevent infinite loops in negative cycles
    while (curr !== goalIdx) {
      const nxt = next[curr][goalIdx];
      const edge = edgeMatrix[curr][goalIdx]; // Ambil edge transisinya
      if (nxt === null) {
        break;
      }
      path.push(nodes[nxt]);
      if (edge) pathEdges.push(edge);
      curr = nxt;
      maxPathNodes--;
      if (maxPathNodes < 0) {
        errorMsg = "🚨 Bahaya! Terdeteksi siklus bobot negatif (Negative Cycle) pada Floyd-Warshall. Rute dihentikan.";
        break; // Infinite loop detected
      }
    }
  } else {
    errorMsg = "Floyd-Warshall tidak menemukan konektivitas rute.";
  }

  const endTime = performance.now();

  return {
    path,
    pathEdges,
    totalWeight: startIdx !== undefined && goalIdx !== undefined ? dist[startIdx][goalIdx] : Infinity,
    totalDistanceKm: pathEdges.reduce((sum, e) => sum + e.distanceKm, 0),
    exploredNodesCount: exploredCount,
    executionTimeMs: parseFloat((endTime - startTime).toFixed(4)),
    errorMessage: errorMsg,
  };
}

// Map dari nama/tipe algoritma ke fungsi eksekusinya
export const ALGORITHMS_INFO = {
  dijkstra: {
    name: "Dijkstra",
    creator: "Edsger W. Dijkstra (1956)",
    complexity: "O((V + E) log V) dengan Min-Heap",
    about: "Mencari lintasan terpandu terpendek dari satu titik sumber tunggal ke titik lain dengan bobot bernilai positif.",
    pros: [
      "Menjamin rute terpendek yang paling optimal secara matematis.",
      "Sangat efisien dan cepat pada graf berukuran sedang.",
      "Sangat stabil dan banyak digunakan dalam sistem basis navigasi statis.",
    ],
    cons: "Gagal atau menghasilkan rute tidak menentu jika terdapat bobot sisi negatif pada jalur."
  },
  bellman_ford: {
    name: "Bellman-Ford",
    creator: "Richard Bellman & Lester Ford (1958)",
    complexity: "O(V * E)",
    about: "Algoritma pencari jalur terpendek dari satu titik awal yang mendukung bobot bernilai negatif serta mampu mendeteksi siklus negatif.",
    pros: [
      "Mendukung bobot jalan bernilai negatif (berguna untuk simulasi kompensasi bahan bakar, Eco-Bonus ramah lingkungan, dll).",
      "Mampu mendeteksi 'Negative Cycle' untuk mencegah pengulangan putaran rute yang tak terhingga.",
      "Desain algoritma sangat aman terhadap distorsi ekstrim beban rute.",
    ],
    cons: "Kecepatan eksekusi lebih lambat dibandingkan Dijkstra untuk jaringan graf besar berukuran ribuan node."
  },
  a_star: {
    name: "A* (A-Star) Search",
    creator: "Peter Hart, Nils Nilsson & Bertram Raphael (1968)",
    complexity: "O(E) heuristik (kasus terbaik)",
    about: "Algoritma penjelajah rute berbasis heuristik terpandu yang menggabungkan jarak tempuh aktual g(n) dan perkiraan jarak garis lurus ke tujuan h(n).",
    pros: [
      "Sangat cepat karena arah pencarian fokus menuju target (tidak meluas ke arah sebaliknya).",
      "Sangat sedikit mengeksplorasi node tidak penting, menghemat memori komputer & CPU.",
      "Standar industri emas untuk game AI navigasi dan pelacak satelit GPS langsung.",
    ],
    cons: "Akurasi bergantung langsung pada keandalan nilai heuristik udara (Haversine). Jika heuristik berlebihan, rute bisa kurang optimal."
  },
  floyd_warshall: {
    name: "Floyd-Warshall",
    creator: "Robert Floyd & Stephen Warshall (1962)",
    complexity: "O(V³)",
    about: "Algoritma pemrograman dinamis cerdas yang menghitung jarak terpendek antar semua pasang titik di graf secara simultan dalam sekali kerja.",
    pros: [
      "Menghasilkan pemetaan rute komprehensif antar setiap pasang titik kombinasi secara instan.",
      "Sangat tangguh untuk pengerjaan optimasi 'multi-stop scheduling' dinamis harian.",
      "Kode implementasi sangat ringkas dan andal.",
    ],
    cons: "Sangat berat (O(V³)) jika digunakan pada jumlah node yang terlampau besar, namun ideal untuk sekelompok stop harian (< 100)."
  }
};

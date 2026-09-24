/**
 * Offline gazetteer of major Indian cities/localities.
 * Used by the "offline" geocoder (tests/CI), as a network fallback and by the
 * seed script. Production normally uses Google / Mapbox / Nominatim, and
 * NEW cities are created dynamically from geocoder results — this list is
 * NOT a whitelist.
 */
export interface GazetteerCity {
  name: string;
  state: string;
  lat: number;
  lng: number;
  localities: { name: string; lat: number; lng: number; pincode: string }[];
}

export const GAZETTEER: GazetteerCity[] = [
  {
    name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777,
    localities: [
      { name: "Andheri", lat: 19.1136, lng: 72.8697, pincode: "400053" },
      { name: "Bandra", lat: 19.0596, lng: 72.8295, pincode: "400050" },
      { name: "Powai", lat: 19.1176, lng: 72.906, pincode: "400076" },
      { name: "Colaba", lat: 18.9067, lng: 72.8147, pincode: "400005" },
      { name: "Dadar", lat: 19.0178, lng: 72.8478, pincode: "400014" },
    ],
  },
  {
    name: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209,
    localities: [
      { name: "Connaught Place", lat: 28.6315, lng: 77.2167, pincode: "110001" },
      { name: "Hauz Khas", lat: 28.5494, lng: 77.2001, pincode: "110016" },
      { name: "Saket", lat: 28.5245, lng: 77.2066, pincode: "110017" },
      { name: "Dwarka", lat: 28.5921, lng: 77.046, pincode: "110075" },
      { name: "Lajpat Nagar", lat: 28.5677, lng: 77.2433, pincode: "110024" },
    ],
  },
  {
    name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946,
    localities: [
      { name: "Koramangala", lat: 12.9352, lng: 77.6245, pincode: "560034" },
      { name: "Indiranagar", lat: 12.9784, lng: 77.6408, pincode: "560038" },
      { name: "HSR Layout", lat: 12.9116, lng: 77.6474, pincode: "560102" },
      { name: "Whitefield", lat: 12.9698, lng: 77.75, pincode: "560066" },
      { name: "Jayanagar", lat: 12.925, lng: 77.5938, pincode: "560041" },
    ],
  },
  {
    name: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567,
    localities: [
      { name: "Kothrud", lat: 18.5074, lng: 73.8077, pincode: "411038" },
      { name: "Baner", lat: 18.559, lng: 73.7868, pincode: "411045" },
      { name: "Viman Nagar", lat: 18.5679, lng: 73.9143, pincode: "411014" },
      { name: "Hinjewadi", lat: 18.5913, lng: 73.7389, pincode: "411057" },
    ],
  },
  {
    name: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867,
    localities: [
      { name: "Gachibowli", lat: 17.4401, lng: 78.3489, pincode: "500032" },
      { name: "Banjara Hills", lat: 17.4138, lng: 78.4398, pincode: "500034" },
      { name: "Madhapur", lat: 17.4483, lng: 78.3915, pincode: "500081" },
      { name: "Kukatpally", lat: 17.4849, lng: 78.4138, pincode: "500072" },
    ],
  },
  {
    name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707,
    localities: [
      { name: "T. Nagar", lat: 13.0418, lng: 80.2341, pincode: "600017" },
      { name: "Adyar", lat: 13.0012, lng: 80.2565, pincode: "600020" },
      { name: "Velachery", lat: 12.9815, lng: 80.218, pincode: "600042" },
      { name: "Anna Nagar", lat: 13.085, lng: 80.2101, pincode: "600040" },
    ],
  },
  {
    name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lng: 73.0243,
    localities: [
      { name: "Sardarpura", lat: 26.2743, lng: 73.0064, pincode: "342003" },
      { name: "Ratanada", lat: 26.2667, lng: 73.0391, pincode: "342011" },
      { name: "Paota", lat: 26.3001, lng: 73.0293, pincode: "342006" },
      { name: "Karwar", lat: 26.4715, lng: 73.1134, pincode: "342030" },
    ],
  },
  {
    name: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639,
    localities: [
      { name: "Salt Lake", lat: 22.5867, lng: 88.4171, pincode: "700091" },
      { name: "Park Street", lat: 22.5535, lng: 88.3525, pincode: "700016" },
      { name: "Ballygunge", lat: 22.5276, lng: 88.3653, pincode: "700019" },
    ],
  },
  {
    name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714,
    localities: [
      { name: "Navrangpura", lat: 23.0365, lng: 72.5611, pincode: "380009" },
      { name: "Satellite", lat: 23.0301, lng: 72.5177, pincode: "380015" },
      { name: "Bopal", lat: 23.0333, lng: 72.4633, pincode: "380058" },
    ],
  },
  {
    name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873,
    localities: [
      { name: "Malviya Nagar", lat: 26.8549, lng: 75.8243, pincode: "302017" },
      { name: "Vaishali Nagar", lat: 26.9115, lng: 75.7426, pincode: "302021" },
      { name: "C-Scheme", lat: 26.9056, lng: 75.8002, pincode: "302001" },
    ],
  },
];

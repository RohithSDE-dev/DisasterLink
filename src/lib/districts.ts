import geo from "@/data/tn-districts.geo.json";

export type DistrictSeed = {
  code: string;
  name: string;
  region: "North" | "West" | "Central" | "Delta" | "South";
  lat: number;
  lng: number;
};

/** All 38 Tamil Nadu districts (post-2020 reorganisation). */
export const DISTRICTS: DistrictSeed[] = [
  { code: "TN-CHN", name: "Chennai", region: "North", lat: 13.0827, lng: 80.2707 },
  { code: "TN-CGL", name: "Chengalpattu", region: "North", lat: 12.6819, lng: 79.9888 },
  { code: "TN-KCH", name: "Kancheepuram", region: "North", lat: 12.8342, lng: 79.7036 },
  { code: "TN-TVL", name: "Tiruvallur", region: "North", lat: 13.1231, lng: 79.9093 },
  { code: "TN-RNP", name: "Ranipet", region: "North", lat: 12.9249, lng: 79.3308 },
  { code: "TN-VLR", name: "Vellore", region: "North", lat: 12.9165, lng: 79.1325 },
  { code: "TN-TPT", name: "Tirupattur", region: "North", lat: 12.4954, lng: 78.5678 },
  { code: "TN-KRG", name: "Krishnagiri", region: "North", lat: 12.5186, lng: 78.2137 },
  { code: "TN-DHM", name: "Dharmapuri", region: "North", lat: 12.1211, lng: 78.158 },
  { code: "TN-TVM", name: "Tiruvannamalai", region: "North", lat: 12.2253, lng: 79.0747 },
  { code: "TN-VPM", name: "Villupuram", region: "North", lat: 11.9401, lng: 79.4861 },
  { code: "TN-KKL", name: "Kallakurichi", region: "North", lat: 11.7385, lng: 78.9597 },
  { code: "TN-CDL", name: "Cuddalore", region: "North", lat: 11.748, lng: 79.7714 },
  { code: "TN-ARY", name: "Ariyalur", region: "Central", lat: 11.1401, lng: 79.0756 },
  { code: "TN-PBL", name: "Perambalur", region: "Central", lat: 11.2342, lng: 78.8816 },
  { code: "TN-SLM", name: "Salem", region: "Central", lat: 11.6643, lng: 78.146 },
  { code: "TN-NMK", name: "Namakkal", region: "Central", lat: 11.2189, lng: 78.1677 },
  { code: "TN-ERD", name: "Erode", region: "West", lat: 11.341, lng: 77.7172 },
  { code: "TN-NLG", name: "Nilgiris", region: "West", lat: 11.4064, lng: 76.6932 },
  { code: "TN-CBE", name: "Coimbatore", region: "West", lat: 11.0168, lng: 76.9558 },
  { code: "TN-TPR", name: "Tiruppur", region: "West", lat: 11.1085, lng: 77.3411 },
  { code: "TN-KRR", name: "Karur", region: "Central", lat: 10.9601, lng: 78.0766 },
  { code: "TN-TRC", name: "Tiruchirappalli", region: "Central", lat: 10.7905, lng: 78.7047 },
  { code: "TN-TNJ", name: "Thanjavur", region: "Delta", lat: 10.787, lng: 79.1378 },
  { code: "TN-TVR", name: "Thiruvarur", region: "Delta", lat: 10.7724, lng: 79.6368 },
  { code: "TN-NGP", name: "Nagapattinam", region: "Delta", lat: 10.7661, lng: 79.8444 },
  { code: "TN-MYL", name: "Mayiladuthurai", region: "Delta", lat: 11.1036, lng: 79.6522 },
  { code: "TN-PDK", name: "Pudukkottai", region: "Central", lat: 10.3833, lng: 78.8001 },
  { code: "TN-DGL", name: "Dindigul", region: "South", lat: 10.3624, lng: 77.9695 },
  { code: "TN-MDU", name: "Madurai", region: "South", lat: 9.9252, lng: 78.1198 },
  { code: "TN-THI", name: "Theni", region: "South", lat: 10.0104, lng: 77.4768 },
  { code: "TN-VNR", name: "Virudhunagar", region: "South", lat: 9.568, lng: 77.9624 },
  { code: "TN-SVG", name: "Sivaganga", region: "South", lat: 9.8433, lng: 78.4809 },
  { code: "TN-RMD", name: "Ramanathapuram", region: "South", lat: 9.3639, lng: 78.8395 },
  { code: "TN-TUT", name: "Thoothukudi", region: "South", lat: 8.7642, lng: 78.1348 },
  { code: "TN-TSI", name: "Tenkasi", region: "South", lat: 8.9594, lng: 77.3152 },
  { code: "TN-TNV", name: "Tirunelveli", region: "South", lat: 8.7139, lng: 77.7567 },
  { code: "TN-KKI", name: "Kanyakumari", region: "South", lat: 8.0883, lng: 77.5385 },
];

export const BOUNDARY_SOURCE = {
  name: "2011 Census district boundaries (simplified) — udit-001/india-maps-data",
  url: "https://github.com/udit-001/india-maps-data",
  note: "37 undivided district polygons. Mayiladuthurai was carved from Nagapattinam in 2020 and is listed without a separate polygon in this dataset.",
};

/** Normalise a name for matching the Census boundary dataset. */
function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

const alias: Record<string, string> = {
  thiruvallur: "TN-TVL",
  thoothukkudi: "TN-TUT",
  viluppuram: "TN-VPM",
  tirupathur: "TN-TPT",
  kancheepuram: "TN-KCH",
  nilgiris: "TN-NLG",
  tiruvannamalai: "TN-TVM",
  tiruchirappalli: "TN-TRC",
  thiruvarur: "TN-TVR",
  pudukkottai: "TN-PDK",
  kanyakumari: "TN-KKI",
  chengalpattu: "TN-CGL",
};

const nameIndex = new Map(DISTRICTS.map((d) => [key(d.name), d.code]));

export type DistrictPolygon = {
  code: string;
  name: string;
  rings: number[][][];
  centroid: [number, number];
  hasPolygon: boolean;
};

export const DISTRICT_GEOMETRY: DistrictPolygon[] = DISTRICTS.map((d) => {
  const match = geo.features.find((f) => nameIndex.get(key(f.name)) === d.code || alias[key(f.name)] === d.code);
  return {
    code: d.code,
    name: d.name,
    rings: match ? (match.rings as number[][][]) : [],
    centroid: match ? (match.centroid as [number, number]) : [d.lng, d.lat],
    hasPolygon: Boolean(match),
  };
});

export function districtByCode(code: string | null | undefined): DistrictSeed | undefined {
  return DISTRICTS.find((d) => d.code === code);
}

export function districtByName(name: string | null | undefined): DistrictSeed | undefined {
  if (!name) return undefined;
  const code = nameIndex.get(key(name)) ?? alias[key(name)];
  return districtByCode(code);
}

/** Simplified schematic river/water-body centerlines (public map derived, not survey data). */
export const RIVERS: { name: string; points: [number, number][] }[] = [
  {
    name: "Kaveri",
    points: [
      [78.16, 12.52],
      [78.08, 12.2],
      [77.98, 11.93],
      [78.06, 11.62],
      [78.17, 11.3],
      [78.43, 11.03],
      [78.7, 10.83],
      [79.05, 10.86],
      [79.28, 10.83],
      [79.58, 10.86],
      [79.79, 10.83],
    ],
  },
  {
    name: "Bhavani",
    points: [
      [76.72, 11.4],
      [76.95, 11.44],
      [77.15, 11.45],
      [77.4, 11.42],
      [77.62, 11.35],
      [77.72, 11.28],
    ],
  },
  {
    name: "Amaravathi",
    points: [
      [77.28, 10.45],
      [77.38, 10.62],
      [77.5, 10.78],
      [77.62, 10.95],
      [77.82, 11.02],
    ],
  },
  {
    name: "Vaigai",
    points: [
      [77.48, 10.06],
      [77.68, 10.02],
      [77.86, 9.98],
      [78.05, 9.94],
      [78.22, 9.92],
      [78.42, 9.85],
    ],
  },
  {
    name: "Thamirabarani",
    points: [
      [77.35, 8.98],
      [77.5, 8.9],
      [77.62, 8.79],
      [77.75, 8.7],
      [77.93, 8.65],
    ],
  },
  {
    name: "Palar",
    points: [
      [78.62, 12.9],
      [78.8, 12.83],
      [79.0, 12.75],
      [79.25, 12.68],
      [79.48, 12.63],
      [79.72, 12.55],
    ],
  },
  {
    name: "Ponnaiyar",
    points: [
      [78.24, 12.3],
      [78.5, 12.25],
      [78.78, 12.18],
      [79.05, 12.08],
      [79.38, 11.94],
      [79.62, 11.8],
    ],
  },
  {
    name: "Kollidam",
    points: [
      [79.1, 11.12],
      [79.24, 11.0],
      [79.38, 10.9],
      [79.5, 10.78],
      [79.68, 10.7],
    ],
  },
  {
    name: "Vellar",
    points: [
      [78.68, 11.62],
      [78.9, 11.55],
      [79.12, 11.48],
      [79.35, 11.42],
      [79.52, 11.38],
    ],
  },
];

export const RIVER_SOURCE = {
  name: "Schematic river centerlines (public maps derived)",
  url: "https://www.openstreetmap.org/",
  note: "Illustrative alignment for situational awareness only — not a survey-grade waterway dataset. Not used to declare an official flood-prone zone.",
};

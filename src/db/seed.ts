import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  assignments,
  auditLogs,
  dataSources,
  districts,
  facilities,
  incidentEvents,
  incidents,
  resources,
  sosEvents,
  sosRequests,
  teams,
  users,
} from "@/db/schema";
import { DISTRICTS } from "@/lib/districts";
import { hashPassword } from "@/lib/auth";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

export const DEMO_USERS = [
  { name: "Citizen Demo", email: "citizen@disasterlink.demo", password: "Citizen@123", role: "CITIZEN", phone: "+91 90000 00001", districtCode: "TN-CBE" },
  { name: "Duty Officer (Admin)", email: "admin@disasterlink.demo", password: "Admin@123", role: "ADMIN", phone: "+91 90000 00002", districtCode: "TN-CBE" },
  { name: "State Controller (Super Admin)", email: "super@disasterlink.demo", password: "Super@123", role: "SUPER_ADMIN", phone: "+91 90000 00003", districtCode: "TN-CHN" },
];

type FacilitySeed = [string, string, string, number, number, string];

const FACILITY_SEEDS: FacilitySeed[] = [
  ["Rajiv Gandhi Government General Hospital", "HOSPITAL", "TN-CHN", 13.0827, 80.2767, "Park Town, Chennai"],
  ["Government Stanley Medical College Hospital", "HOSPITAL", "TN-CHN", 13.1075, 80.2858, "Old Jail Road, Royapuram, Chennai"],
  ["Kilpauk Medical College Hospital", "HOSPITAL", "TN-CHN", 13.0782, 80.2426, "Kilpauk, Chennai"],
  ["Institute of Child Health and Hospital for Children", "HOSPITAL", "TN-CHN", 13.0775, 80.2646, "Egmore, Chennai"],
  ["Apollo Hospitals, Greams Road", "HOSPITAL", "TN-CHN", 13.0606, 80.251, "Greams Road, Chennai"],
  ["Greater Chennai Police Commissioner's Office", "POLICE_STATION", "TN-CHN", 13.0732, 80.2765, "EVK Sampath Road, Vepery, Chennai"],
  ["Tamil Nadu Fire and Rescue Services Headquarters", "FIRE_STATION", "TN-CHN", 13.0812, 80.2707, "Chennai"],
  ["Coimbatore Medical College Hospital", "HOSPITAL", "TN-CBE", 11.0178, 76.9778, "Trichy Road, Coimbatore"],
  ["PSG Hospitals", "HOSPITAL", "TN-CBE", 11.0384, 77.0104, "Peelamedu, Coimbatore"],
  ["Ganga Hospital", "HOSPITAL", "TN-CBE", 11.03, 76.964, "Mettupalayam Road, Coimbatore"],
  ["Kovai Medical Center and Hospital", "HOSPITAL", "TN-CBE", 11.0832, 77.0021, "Avinashi Road, Coimbatore"],
  ["Coimbatore City Police Commissioner's Office", "POLICE_STATION", "TN-CBE", 11.0016, 76.9626, "GV Residency, Coimbatore"],
  ["Coimbatore Fire and Rescue Services", "FIRE_STATION", "TN-CBE", 11.006, 76.965, "Coimbatore"],
  ["Government Rajaji Hospital", "HOSPITAL", "TN-MDU", 9.929, 78.134, "Panagal Road, Madurai"],
  ["Velammal Medical College Hospital", "HOSPITAL", "TN-MDU", 9.884, 78.125, "Anuppanadi, Madurai"],
  ["Madurai City Police Commissioner's Office", "POLICE_STATION", "TN-MDU", 9.9252, 78.1198, "Madurai"],
  ["Mahatma Gandhi Memorial Government Hospital", "HOSPITAL", "TN-TRC", 10.805, 78.69, "Puthur, Tiruchirappalli"],
  ["Kauvery Hospital, Tennur", "HOSPITAL", "TN-TRC", 10.818, 78.688, "Tennur, Tiruchirappalli"],
  ["Government Mohan Kumaramangalam Medical College Hospital", "HOSPITAL", "TN-SLM", 11.67, 78.14, "Salem"],
  ["Tirunelveli Medical College Hospital", "HOSPITAL", "TN-TNV", 8.7139, 77.7567, "Palayamkottai, Tirunelveli"],
  ["Christian Medical College Vellore", "HOSPITAL", "TN-VLR", 12.9165, 79.1325, "Ida Scudder Road, Vellore"],
  ["Thanjavur Medical College Hospital", "HOSPITAL", "TN-TNJ", 10.77, 79.13, "Thanjavur"],
  ["Thoothukudi Government Medical College Hospital", "HOSPITAL", "TN-TUT", 8.7642, 78.1348, "Thoothukudi"],
  ["Government Medical College Hospital, Asaripallam", "HOSPITAL", "TN-KKI", 8.19, 77.42, "Asaripallam, Kanyakumari"],
  ["Erode Government Headquarters Hospital", "HOSPITAL", "TN-ERD", 11.341, 77.7172, "Erode"],
  ["Government Medical College, Udhagamandalam", "HOSPITAL", "TN-NLG", 11.4064, 76.6932, "Udhagamandalam, Nilgiris"],
  ["Chengalpattu Government Medical College Hospital", "HOSPITAL", "TN-CGL", 12.6819, 79.9888, "Chengalpattu"],
  ["Tiruppur Government Medical College Hospital", "HOSPITAL", "TN-TPR", 11.1085, 77.3411, "Tiruppur"],
  ["Dindigul Government Medical College Hospital", "HOSPITAL", "TN-DGL", 10.3624, 77.9695, "Dindigul"],
  ["Government Medical College Hospital, Krishnagiri", "HOSPITAL", "TN-KRG", 12.5186, 78.2137, "Krishnagiri"],
  ["Government Medical College Hospital, Dharmapuri", "HOSPITAL", "TN-DHM", 12.1211, 78.158, "Dharmapuri"],
  ["Government Medical College Hospital, Karur", "HOSPITAL", "TN-KRR", 10.9601, 78.0766, "Karur"],
  ["Government Medical College Hospital, Pudukkottai", "HOSPITAL", "TN-PDK", 10.3833, 78.8001, "Pudukkottai"],
  ["Government Medical College Hospital, Sivaganga", "HOSPITAL", "TN-SVG", 9.8433, 78.4809, "Sivaganga"],
  ["Government Medical College Hospital, Theni", "HOSPITAL", "TN-THI", 10.0104, 77.4768, "Theni"],
  ["Government Medical College Hospital, Virudhunagar", "HOSPITAL", "TN-VNR", 9.568, 77.9624, "Virudhunagar"],
  ["Government Medical College Hospital, Tenkasi", "HOSPITAL", "TN-TSI", 8.9594, 77.3152, "Tenkasi"],
  ["Government Medical College Hospital, Tiruvallur", "HOSPITAL", "TN-TVL", 13.1231, 79.9093, "Tiruvallur"],
  ["Government Medical College Hospital, Ranipet", "HOSPITAL", "TN-RNP", 12.9249, 79.3308, "Ranipet"],
  ["Government Medical College Hospital, Tirupattur", "HOSPITAL", "TN-TPT", 12.4954, 78.5678, "Tirupattur"],
  ["Government Medical College Hospital, Kallakurichi", "HOSPITAL", "TN-KKL", 11.7385, 78.9597, "Kallakurichi"],
  ["Government Medical College Hospital, Tiruvannamalai", "HOSPITAL", "TN-TVM", 12.2253, 79.0747, "Tiruvannamalai"],
  ["Government Medical College Hospital, Villupuram", "HOSPITAL", "TN-VPM", 11.9401, 79.4861, "Villupuram"],
  ["Ramanathapuram Government Medical College Hospital", "HOSPITAL", "TN-RMD", 9.3639, 78.8395, "Ramanathapuram"],
  ["Cuddalore Government Headquarters Hospital", "HOSPITAL", "TN-CDL", 11.748, 79.7714, "Cuddalore"],
  ["Nagapattinam Government Hospital", "HOSPITAL", "TN-NGP", 10.7661, 79.8444, "Nagapattinam"],
];

type IncidentSeed = {
  publicId: string;
  category: string;
  districtCode: string;
  locationName: string;
  lat: number;
  lng: number;
  description: string;
  reportedSeverity: string;
  assessedSeverity?: string;
  status: string;
  days: number;
};

const INCIDENT_SEEDS: IncidentSeed[] = [
  {
    publicId: "SIM-INC-1001",
    category: "WATERLOGGING",
    districtCode: "TN-CBE",
    locationName: "Gandhipuram, Coimbatore",
    lat: 11.0168,
    lng: 76.9558,
    description: "Knee deep water logging near Gandhipuram bus stand after two hours of heavy rain. Buses are moving slowly and two-wheelers are stranded.",
    reportedSeverity: "HIGH",
    status: "PENDING",
    days: 0.1,
  },
  {
    publicId: "SIM-INC-1002",
    category: "FLOODING",
    districtCode: "TN-CBE",
    locationName: "Singanallur lake outlet, Coimbatore",
    lat: 11.0021,
    lng: 77.0271,
    description: "Water from the lake outlet is entering the low-lying residential street. Around 15 families say water is at waist level.",
    reportedSeverity: "CRITICAL",
    status: "UNDER_REVIEW",
    days: 0.2,
  },
  {
    publicId: "SIM-INC-1003",
    category: "FALLEN_TREE",
    districtCode: "TN-CHN",
    locationName: "Anna Nagar, Chennai",
    lat: 13.085,
    lng: 80.2101,
    description: "A large tree has fallen across the second avenue and is blocking one side of the road. No injuries reported so far.",
    reportedSeverity: "MODERATE",
    status: "VERIFIED",
    assessedSeverity: "MODERATE",
    days: 0.4,
  },
  {
    publicId: "SIM-INC-1004",
    category: "WATERLOGGING",
    districtCode: "TN-CHN",
    locationName: "Velachery, Chennai",
    lat: 12.9756,
    lng: 80.2207,
    description: "Stagnant water near the Velachery MRTS for the second day. Pedestrians are walking on the road, traffic is slow.",
    reportedSeverity: "MODERATE",
    status: "VERIFIED",
    assessedSeverity: "MODERATE",
    days: 1.2,
  },
  {
    publicId: "SIM-INC-1005",
    category: "ROAD_BLOCKAGE",
    districtCode: "TN-MDU",
    locationName: "Bypass Road, Madurai",
    lat: 9.9252,
    lng: 78.1198,
    description: "Debris and a collapsed compound wall are blocking the service road. Ambulance access to the nearby clinic is affected.",
    reportedSeverity: "HIGH",
    status: "VERIFIED",
    assessedSeverity: "HIGH",
    days: 1.6,
  },
  {
    publicId: "SIM-INC-1006",
    category: "LANDSLIDE",
    districtCode: "TN-NLG",
    locationName: "Coonoor ghat road, Nilgiris",
    lat: 11.3538,
    lng: 76.7959,
    description: "Boulders and mud on the ghat road after continuous rain. Two cars are stranded; hill slope is still unstable.",
    reportedSeverity: "CRITICAL",
    status: "VERIFIED",
    assessedSeverity: "CRITICAL",
    days: 2.1,
  },
  {
    publicId: "SIM-INC-1007",
    category: "BUILDING_DAMAGE",
    districtCode: "TN-TNV",
    locationName: "Palayamkottai, Tirunelveli",
    lat: 8.7139,
    lng: 77.7567,
    description: "Rear wall of an old house collapsed. Elderly couple inside were rescued by neighbours, no injuries.",
    reportedSeverity: "HIGH",
    status: "RESOLVED",
    assessedSeverity: "HIGH",
    days: 3.4,
  },
  {
    publicId: "SIM-INC-1008",
    category: "FIRE",
    districtCode: "TN-SLM",
    locationName: "Salem new bus stand",
    lat: 11.6643,
    lng: 78.146,
    description: "Smoke reported from a shop near the bus stand. Fire service reportedly informed by bystanders.",
    reportedSeverity: "HIGH",
    status: "RESOLVED",
    assessedSeverity: "MODERATE",
    days: 4.2,
  },
  {
    publicId: "SIM-INC-1009",
    category: "WATERLOGGING",
    districtCode: "TN-TRC",
    locationName: "Srirangam, Tiruchirappalli",
    lat: 10.8624,
    lng: 78.6893,
    description: "Ankle-deep water in the temple approach street. Shopkeepers say this clears within an hour usually.",
    reportedSeverity: "LOW",
    status: "VERIFIED",
    assessedSeverity: "LOW",
    days: 4.8,
  },
  {
    publicId: "SIM-INC-1010",
    category: "FLOODING",
    districtCode: "TN-NGP",
    locationName: "Nagapattinam coast road",
    lat: 10.7661,
    lng: 79.8444,
    description: "Sea water and rainwater combined near the coast road. Fishing hamlet residents moved to higher ground by the community.",
    reportedSeverity: "HIGH",
    status: "UNDER_REVIEW",
    days: 1.1,
  },
  {
    publicId: "SIM-INC-1011",
    category: "ROAD_BLOCKAGE",
    districtCode: "TN-CDL",
    locationName: "Cuddalore old town",
    lat: 11.748,
    lng: 79.7714,
    description: "Street flooding has made the market road impassable for cars. Two-wheelers are still going through.",
    reportedSeverity: "MODERATE",
    status: "REJECTED",
    days: 5.5,
  },
  {
    publicId: "SIM-INC-1012",
    category: "WATERLOGGING",
    districtCode: "TN-CBE",
    locationName: "Peelamedu, Coimbatore",
    lat: 11.0384,
    lng: 77.0104,
    description: "Water logging on the service road near the hospital gate. Hospital staff say ambulance access is still clear.",
    reportedSeverity: "MODERATE",
    status: "VERIFIED",
    assessedSeverity: "MODERATE",
    days: 2.6,
  },
  {
    publicId: "SIM-INC-1013",
    category: "OTHER",
    districtCode: "TN-KKI",
    locationName: "Nagercoil, Kanyakumari",
    lat: 8.1833,
    lng: 77.4119,
    description: "Live electric wire hanging low over a flooded lane. Residents have kept people away.",
    reportedSeverity: "CRITICAL",
    status: "VERIFIED",
    assessedSeverity: "CRITICAL",
    days: 6.2,
  },
  {
    publicId: "SIM-INC-1014",
    category: "FLOODING",
    districtCode: "TN-TNJ",
    locationName: "Thanjavur canal bank",
    lat: 10.787,
    lng: 79.1378,
    description: "Canal overflow entering three streets in the delta area. Local volunteers are moving elderly residents.",
    reportedSeverity: "HIGH",
    status: "PENDING",
    days: 0.3,
  },
  {
    publicId: "SIM-INC-1015",
    category: "WATERLOGGING",
    districtCode: "TN-ERD",
    locationName: "Erode bus stand",
    lat: 11.341,
    lng: 77.7172,
    description: "Water logging at the bus stand entrance. Buses diverted; no reports of damage.",
    reportedSeverity: "LOW",
    status: "PENDING",
    days: 0.6,
  },
  {
    publicId: "SIM-INC-1016",
    category: "FALLEN_TREE",
    districtCode: "TN-TUT",
    locationName: "Thoothukudi harbour road",
    lat: 8.7642,
    lng: 78.1348,
    description: "Uprooted tree blocking the harbour approach road after overnight wind. Two houses have minor roof damage.",
    reportedSeverity: "MODERATE",
    status: "VERIFIED",
    assessedSeverity: "MODERATE",
    days: 7.3,
  },
];

const TEAM_SEEDS = [
  { name: "Coimbatore Fire & Rescue Unit", type: "FIRE_RESCUE", baseDistrict: "TN-CBE", contact: "Control room (demo)", memberCount: 12, status: "AVAILABLE" },
  { name: "Coimbatore Medical Response Team", type: "MEDICAL", baseDistrict: "TN-CBE", contact: "Control room (demo)", memberCount: 8, status: "AVAILABLE" },
  { name: "Chennai Flood Relief Team", type: "REVENUE", baseDistrict: "TN-CHN", contact: "Control room (demo)", memberCount: 20, status: "AVAILABLE" },
  { name: "Madurai Police Support Team", type: "POLICE", baseDistrict: "TN-MDU", contact: "Control room (demo)", memberCount: 15, status: "AVAILABLE" },
  { name: "Nilgiris Landslide Response", type: "FIRE_RESCUE", baseDistrict: "TN-NLG", contact: "Control room (demo)", memberCount: 10, status: "ASSIGNED" },
  { name: "Tirunelveli Revenue Relief Team", type: "REVENUE", baseDistrict: "TN-TNV", contact: "Control room (demo)", memberCount: 18, status: "AVAILABLE" },
];

const RESOURCE_SEEDS = [
  ["Rescue boats", "BOATS", 6, "boats", "TN-CBE", 1],
  ["High-capacity water pumps", "PUMPS", 10, "pumps", "TN-CBE", 1],
  ["Ambulances", "AMBULANCE", 4, "vehicles", "TN-CBE", 2],
  ["Rescue gear sets", "RESCUE_GEAR", 15, "kits", "TN-CHN", 3],
  ["Shelter kits (tarpaulin + mat)", "SHELTER_KITS", 200, "kits", "TN-CHN", 3],
  ["Food & water packets", "FOOD_WATER", 1500, "packets", "TN-MDU", 4],
  ["Diesel generators", "GENERATOR", 5, "units", "TN-NLG", 5],
  ["Rescue boats", "BOATS", 4, "boats", "TN-TNV", 6],
  ["High-capacity water pumps", "PUMPS", 6, "pumps", "TN-TNV", 6],
  ["Food & water packets", "FOOD_WATER", 800, "packets", "TN-CBE", 2],
] as const;

async function seedDistricts() {
  for (const d of DISTRICTS) {
    await db
      .insert(districts)
      .values({
        code: d.code,
        name: d.name,
        geoName: d.name,
        region: d.region,
        lat: d.lat,
        lng: d.lng,
        boundarySource: "2011 Census district boundaries (simplified)",
        boundaryYear: "2011 / reorganised 2020",
        hasPolygon: d.code !== "TN-MYL",
      })
      .onConflictDoNothing();
  }
}

async function seedUsers() {
  for (const u of DEMO_USERS) {
    await db
      .insert(users)
      .values({
        name: u.name,
        email: u.email,
        passwordHash: hashPassword(u.password),
        role: u.role,
        phone: u.phone,
        districtCode: u.districtCode,
      })
      .onConflictDoNothing();
  }
}

async function seedDataSources() {
  const rows = [
    {
      name: "Open-Meteo Forecast API",
      url: "https://open-meteo.com/",
      coverage: "All 38 Tamil Nadu districts (district reference point)",
      sourceClass: "OBSERVED",
      verificationStatus: "CANDIDATE",
      refreshInterval: "15 minutes (cached in PostgreSQL)",
      enabled: true,
      notes: "Live current weather, 24h hourly rainfall and 5-day forecast. No API key required. Labelled OBSERVED / FORECAST, never OFFICIAL_WARNING.",
    },
    {
      name: "Census 2011 district boundaries (simplified)",
      url: "https://github.com/udit-001/india-maps-data",
      coverage: "37 undivided district polygons; Mayiladuthurai listed without a polygon",
      sourceClass: "MODEL_RISK_ESTIMATE",
      verificationStatus: "CANDIDATE",
      refreshInterval: "Static dataset",
      enabled: true,
      notes: "Boundaries are simplified for rendering performance and are not survey-grade. Not an official delimitation layer.",
    },
    {
      name: "OpenStreetMap / public institution listings",
      url: "https://www.openstreetmap.org/",
      coverage: "Selected hospitals and emergency offices in major districts",
      sourceClass: "COMMUNITY_REPORT",
      verificationStatus: "CANDIDATE",
      refreshInterval: "Manual administrator verification",
      enabled: true,
      notes: "Facility records are candidates. No bed, medicine or stock availability is claimed. Phone numbers are intentionally blank until an administrator records a verified number.",
    },
    {
      name: "India Meteorological Department — CAP warnings",
      url: "https://mausam.imd.gov.in/",
      coverage: "Tamil Nadu (not yet ingested)",
      sourceClass: "OFFICIAL_WARNING",
      verificationStatus: "UNVERIFIED",
      refreshInterval: "Not connected",
      enabled: false,
      notes: "No official warning ingestion is configured. DisasterLink therefore shows an explicit 'no official warnings ingested' state instead of inventing alerts.",
    },
    {
      name: "Tamil Nadu State Disaster Management Authority",
      url: "https://www.tnsdma.tn.gov.in/",
      coverage: "Tamil Nadu (not yet ingested)",
      sourceClass: "OFFICIAL_WARNING",
      verificationStatus: "UNVERIFIED",
      refreshInterval: "Not connected",
      enabled: false,
      notes: "Official shelter designations and advisories must be verified against this source before being published.",
    },
    {
      name: "Citizen incident reports",
      url: "/report",
      coverage: "All districts",
      sourceClass: "COMMUNITY_REPORT",
      verificationStatus: "UNVERIFIED",
      refreshInterval: "Realtime on submission",
      enabled: true,
      notes: "Community reports remain PENDING until an authorised administrator verifies them. Submission never creates a verified incident.",
    },
    {
      name: "DisasterLink simulation engine",
      url: "/demo",
      coverage: "Demonstration records only",
      sourceClass: "SIMULATED",
      verificationStatus: "UNVERIFIED",
      refreshInterval: "On demand",
      enabled: true,
      notes: "All records created by the demo engine carry data_class = SIMULATED and are visually badged throughout the platform.",
    },
  ];
  for (const r of rows) {
    await db.insert(dataSources).values(r);
  }
}

async function seedFacilities() {
  for (const [name, category, districtCode, lat, lng, address] of FACILITY_SEEDS) {
    await db.insert(facilities).values({
      name,
      category,
      districtCode,
      address,
      lat,
      lng,
      phone: null,
      sourceName: "Public institution listing (OSM-derived candidate)",
      sourceUrl: `https://www.openstreetmap.org/search?query=${encodeURIComponent(name)}`,
      sourceClass: "COMMUNITY_REPORT",
      verificationStatus: "CANDIDATE",
      availabilityNote:
        "Not field-verified by DisasterLink. Bed, medicine, stock and opening-hour availability are NOT confirmed. Call the facility directly.",
      isActive: true,
      isOfficialShelter: false,
      dataClass: "CANDIDATE",
    });
  }
}

async function seedTeamsAndResources() {
  for (const t of TEAM_SEEDS) {
    await db.insert(teams).values({ ...t, notes: "Simulated demonstration team. Not a real dispatch unit.", dataClass: "SIMULATED" });
  }
  for (const [name, category, quantity, unit, districtCode, teamId] of RESOURCE_SEEDS) {
    await db.insert(resources).values({ name, category, quantity, unit, districtCode, teamId, status: "AVAILABLE", dataClass: "SIMULATED" });
  }
}

async function seedIncidents() {
  for (const incident of INCIDENT_SEEDS) {
    const createdAt = daysAgo(incident.days);
    const inserted = await db
      .insert(incidents)
      .values({
        publicId: incident.publicId,
        category: incident.category,
        description: incident.description,
        districtCode: incident.districtCode,
        locationName: incident.locationName,
        lat: incident.lat,
        lng: incident.lng,
        reportedSeverity: incident.reportedSeverity,
        assessedSeverity: incident.assessedSeverity ?? null,
        status: incident.status,
        contactName: "Simulated reporter",
        contactPhone: null,
        dataClass: "SIMULATED",
        createdAt,
        updatedAt: createdAt,
        verifiedAt: ["VERIFIED", "RESOLVED"].includes(incident.status) ? new Date(createdAt.getTime() + 3 * 3600_000) : null,
        resolvedAt: incident.status === "RESOLVED" ? new Date(createdAt.getTime() + 30 * 3600_000) : null,
      })
      .onConflictDoNothing()
      .returning({ id: incidents.id });

    if (inserted[0]) {
      await db.insert(incidentEvents).values({
        incidentId: inserted[0].id,
        action: "CREATED",
        toStatus: "PENDING",
        note: "SIMULATED demonstration report generated by the DisasterLink seeding module.",
        actorName: "Simulation Engine",
        actorRole: "SYSTEM",
        createdAt,
      });
    }
  }
}

async function seedSos() {
  const rows = [
    {
      publicId: "SIM-SOS-2001",
      emergencyType: "FLOOD_RESCUE",
      description: "Two elderly people are stranded on the first floor of a house near Singanallur. Water is rising and phone battery is low.",
      districtCode: "TN-CBE",
      locationName: "Singanallur, Coimbatore",
      lat: 11.0021,
      lng: 77.0271,
      name: "Simulated citizen",
      phone: "+91 90000 00010",
      peopleAffected: 2,
      status: "SUBMITTED",
      priority: "CRITICAL",
      days: 0.05,
    },
    {
      publicId: "SIM-SOS-2002",
      emergencyType: "MEDICAL",
      description: "Need dialysis transport support for a patient in a waterlogged street. Access road is not passable for a car.",
      districtCode: "TN-CBE",
      locationName: "Peelamedu, Coimbatore",
      lat: 11.0384,
      lng: 77.0104,
      name: "Simulated citizen",
      phone: "+91 90000 00011",
      peopleAffected: 1,
      status: "UNDER_REVIEW",
      priority: "HIGH",
      days: 0.3,
    },
    {
      publicId: "SIM-SOS-2003",
      emergencyType: "SUPPLIES",
      description: "Relief camp at the community hall needs drinking water for about 40 people. No medical emergency.",
      districtCode: "TN-CHN",
      locationName: "Velachery, Chennai",
      lat: 12.9756,
      lng: 80.2207,
      name: "Simulated volunteer",
      phone: "+91 90000 00012",
      peopleAffected: 40,
      status: "RESOLVED",
      priority: "NORMAL",
      days: 3.2,
    },
  ];
  for (const s of rows) {
    const createdAt = daysAgo(s.days);
    const inserted = await db
      .insert(sosRequests)
      .values({
        publicId: s.publicId,
        emergencyType: s.emergencyType,
        description: s.description,
        districtCode: s.districtCode,
        locationName: s.locationName,
        lat: s.lat,
        lng: s.lng,
        name: s.name,
        phone: s.phone,
        peopleAffected: s.peopleAffected,
        status: s.status,
        priority: s.priority,
        dataClass: "SIMULATED",
        createdAt,
        updatedAt: createdAt,
        resolvedAt: s.status === "RESOLVED" ? new Date(createdAt.getTime() + 8 * 3600_000) : null,
        resolutionNote: s.status === "RESOLVED" ? "SIMULATED resolution: water packets delivered by the demo relief team." : null,
      })
      .onConflictDoNothing()
      .returning({ id: sosRequests.id });
    if (inserted[0]) {
      await db.insert(sosEvents).values({
        sosId: inserted[0].id,
        action: "CREATED",
        toStatus: "SUBMITTED",
        note: "SIMULATED SOS created by the seeding module.",
        actorName: "Simulation Engine",
        actorRole: "SYSTEM",
        createdAt,
      });
    }
  }
}

async function seedAlertAndAudit() {
  await db.insert(alerts).values({
    title: "SIMULATED heavy rainfall advisory for Coimbatore (demo only)",
    summary:
      "This record exists only to demonstrate how DisasterLink displays an issued warning. It is NOT an official IMD or TNSDMA warning and must never be read as one.",
    districtCode: "TN-CBE",
    severity: "HIGH",
    sourceName: "DisasterLink Demonstration Mode",
    sourceUrl: "/demo",
    sourceClass: "SIMULATED",
    verification: "UNVERIFIED",
    issuedAt: daysAgo(0.2),
    expiresAt: new Date(Date.now() + DAY),
    isSimulated: true,
  });
  await db.insert(assignments).values({
    teamId: 5,
    teamName: "Nilgiris Landslide Response",
    incidentId: null,
    sosId: null,
    resourcesAllocated: "Rescue gear sets, diesel generator",
    status: "ON_SITE",
    notes: "SIMULATED assignment created during seeding to demonstrate assignment history.",
    assignedByName: "Simulation Engine",
    dataClass: "SIMULATED",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(0.5),
  });
  await db.insert(auditLogs).values({
    actorName: "Simulation Engine",
    actorRole: "SYSTEM",
    action: "SEED",
    entityType: "SYSTEM",
    entityId: "seed",
    summary: "Seeded 38 districts, candidate facilities, and SIMULATED demonstration records.",
    details: { incidents: INCIDENT_SEEDS.length, teams: TEAM_SEEDS.length, dataClass: "SIMULATED" },
  });
}

/* ------------------------- extended upgrade seed ------------------------- */

const SHELTER_SEEDS = [
  { name: "Demonstration relief camp — Coimbatore East", districtCode: "TN-CBE", lat: 11.0021, lng: 77.0271, capacity: 240, occupancy: 86 },
  { name: "Demonstration relief camp — Chennai South", districtCode: "TN-CHN", lat: 12.9756, lng: 80.2207, capacity: 320, occupancy: 210 },
  { name: "Demonstration relief camp — Madurai Central", districtCode: "TN-MDU", lat: 9.929, lng: 78.134, capacity: 180, occupancy: 54 },
  { name: "Demonstration relief camp — Nagapattinam Coastal", districtCode: "TN-NGP", lat: 10.7661, lng: 79.8444, capacity: 260, occupancy: 148 },
  { name: "Demonstration relief camp — Salem North", districtCode: "TN-SLM", lat: 11.6643, lng: 78.146, capacity: 150, occupancy: 22 },
  { name: "Demonstration relief camp — Tirunelveli", districtCode: "TN-TNV", lat: 8.7139, lng: 77.7567, capacity: 200, occupancy: 65 },
  { name: "Demonstration relief camp — Nilgiris Ghat", districtCode: "TN-NLG", lat: 11.4064, lng: 76.6932, capacity: 90, occupancy: 77 },
  { name: "Demonstration relief camp — Thanjavur Delta", districtCode: "TN-TNJ", lat: 10.787, lng: 79.1378, capacity: 220, occupancy: 96 },
  { name: "Demonstration relief camp — Chengalpattu", districtCode: "TN-CGL", lat: 12.6819, lng: 79.9888, capacity: 160, occupancy: 0 },
  { name: "Demonstration relief camp — Erode", districtCode: "TN-ERD", lat: 11.341, lng: 77.7172, capacity: 140, occupancy: 31 },
];

const AMBULANCE_SEEDS = [
  { name: "108 ambulance — Coimbatore unit 1", districtCode: "TN-CBE", lat: 11.0168, lng: 76.9558, availabilityStatus: "AVAILABLE" },
  { name: "108 ambulance — Coimbatore unit 2", districtCode: "TN-CBE", lat: 11.0384, lng: 77.0104, availabilityStatus: "LIMITED" },
  { name: "108 ambulance — Chennai unit 1", districtCode: "TN-CHN", lat: 13.0827, lng: 80.2707, availabilityStatus: "AVAILABLE" },
  { name: "108 ambulance — Chennai unit 2", districtCode: "TN-CHN", lat: 13.06, lng: 80.25, availabilityStatus: "CLOSED" },
  { name: "108 ambulance — Madurai unit", districtCode: "TN-MDU", lat: 9.9252, lng: 78.1198, availabilityStatus: "AVAILABLE" },
  { name: "108 ambulance — Salem unit", districtCode: "TN-SLM", lat: 11.6643, lng: 78.146, availabilityStatus: "AVAILABLE" },
  { name: "108 ambulance — Tirunelveli unit", districtCode: "TN-TNV", lat: 8.7139, lng: 77.7567, availabilityStatus: "LIMITED" },
  { name: "108 ambulance — Thanjavur unit", districtCode: "TN-TNJ", lat: 10.787, lng: 79.1378, availabilityStatus: "AVAILABLE" },
];

async function seedExtendedUsers() {
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.email, "officer@disasterlink.demo"));
  if ((existing[0]?.count ?? 0) === 0) {
    await db.insert(users).values({
      name: "Government Officer (read-only)",
      email: "officer@disasterlink.demo",
      passwordHash: hashPassword("Officer@123"),
      role: "OFFICER",
      phone: "+91 90000 00004",
      districtCode: "TN-CHN",
    });
  }
}

async function seedExtendedFacilities() {
  const shelters = await db.select({ count: sql<number>`count(*)::int` }).from(facilities).where(eq(facilities.category, "SHELTER"));
  if ((shelters[0]?.count ?? 0) === 0) {
    for (const shelter of SHELTER_SEEDS) {
      await db.insert(facilities).values({
        name: shelter.name,
        category: "SHELTER",
        districtCode: shelter.districtCode,
        address: `${shelter.name} (demonstration location)`,
        lat: shelter.lat,
        lng: shelter.lng,
        phone: null,
        sourceName: "DisasterLink simulation engine",
        sourceUrl: "/demo",
        sourceClass: "SIMULATED",
        verificationStatus: "CANDIDATE",
        availabilityNote:
          "SIMULATED capacity and occupancy for demonstration. This is NOT an official government shelter designation — verify with district authorities.",
        availabilityConfirmedAt: new Date(),
        isActive: true,
        isOfficialShelter: false,
        facilityClass: "GOVERNMENT",
        availabilityStatus: shelter.occupancy >= shelter.capacity ? "FULL" : shelter.occupancy === 0 ? "AVAILABLE" : "LIMITED",
        capacity: shelter.capacity,
        occupancy: shelter.occupancy,
        capacityDataClass: "SIMULATED",
        dataClass: "SIMULATED",
      });
    }
  }

  const ambulances = await db.select({ count: sql<number>`count(*)::int` }).from(facilities).where(eq(facilities.category, "AMBULANCE_SERVICE"));
  if ((ambulances[0]?.count ?? 0) === 0) {
    for (const ambulance of AMBULANCE_SEEDS) {
      await db.insert(facilities).values({
        name: ambulance.name,
        category: "AMBULANCE_SERVICE",
        districtCode: ambulance.districtCode,
        address: "Dispatch base (demonstration record)",
        lat: ambulance.lat,
        lng: ambulance.lng,
        phone: null,
        sourceName: "DisasterLink simulation engine",
        sourceUrl: "/demo",
        sourceClass: "SIMULATED",
        verificationStatus: "CANDIDATE",
        availabilityNote: "SIMULATED availability status for demonstrating ambulance coordination. Not a live fleet feed.",
        availabilityConfirmedAt: new Date(),
        isActive: true,
        isOfficialShelter: false,
        facilityClass: "GOVERNMENT",
        availabilityStatus: ambulance.availabilityStatus,
        capacityDataClass: "SIMULATED",
        dataClass: "SIMULATED",
      });
    }
  }

  await db.execute(sql`
    update facilities
       set facility_class = case
             when (name ilike '%government%' or name ilike '%medical college%' or name ilike '%general hospital%')
               and name not ilike '%christian medical college%' then 'GOVERNMENT'
             else 'PRIVATE'
           end
     where facility_class = 'UNKNOWN' and category = 'HOSPITAL'
  `);
}

let seeding: Promise<void> | null = null;

/** Idempotent seeding so a fresh database is immediately demonstrable. */
export async function ensureSeeded(): Promise<void> {
  if (seeding) return seeding;
  seeding = (async () => {
    try {
      const existing = await db.select({ count: sql<number>`count(*)::int` }).from(districts);
      if ((existing[0]?.count ?? 0) < DISTRICTS.length) {
        await seedDistricts();
        await seedUsers();
        await seedDataSources();
        await seedFacilities();
        await seedTeamsAndResources();
        await seedIncidents();
        await seedSos();
        await seedAlertAndAudit();
      }
      await seedExtendedUsers();
      await seedExtendedFacilities();
    } catch (error) {
      console.error("[seed] failed", error);
      seeding = null;
      throw error;
    }
  })();
  return seeding;
}

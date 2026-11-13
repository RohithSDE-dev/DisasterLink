export type SafetyTopic = {
  id: string;
  title: string;
  intro: string;
  before: string[];
  during: string[];
  after: string[];
};

export const SAFETY_TOPICS: SafetyTopic[] = [
  {
    id: "flood",
    title: "Floods and river overflow",
    intro: "Flood water is fast, contaminated and often hides open drains or live wiring.",
    before: [
      "Learn whether your street is in a low-lying area and identify the nearest higher ground.",
      "Keep documents, medicines and a power bank in a waterproof bag.",
      "Never store valuables at floor level during the north-east monsoon.",
      "Note two evacuation routes and share a family meeting point.",
    ],
    during: [
      "Move to higher floors before water enters your home; avoid basements entirely.",
      "Never walk, swim or drive through flowing water — 15 cm can knock an adult down.",
      "If water is rising and you are trapped, call 112 and submit an SOS with your location, then conserve phone battery.",
      "Do not touch electrical switches or appliances with wet hands.",
    ],
    after: [
      "Wait for official clearance before returning; flood water remains hazardous for days.",
      "Boil or treat all drinking water and discard food touched by flood water.",
      "Photograph damage before cleaning for insurance and relief claims.",
      "Watch for structural cracks and report them to the local body.",
    ],
  },
  {
    id: "heavy-rain",
    title: "Heavy rainfall and waterlogging",
    intro: "Short, intense spells can overwhelm drainage within minutes.",
    before: [
      "Clear rooftop and balcony drains before the monsoon.",
      "Keep vehicles on higher ground where feasible.",
      "Charge phones and keep a torch, whistle and first-aid kit ready.",
    ],
    during: [
      "Avoid underpasses, subways and known waterlogging spots.",
      "If a road looks flooded, turn back — do not test the depth.",
      "Report waterlogging with a landmark so responders can prioritise.",
    ],
    after: [
      "Watch for open manholes and broken roads that water may have exposed.",
      "Check on elderly and disabled neighbours.",
      "Clean stagnant water containers to reduce mosquito breeding.",
    ],
  },
  {
    id: "cyclone",
    title: "Cyclones and coastal hazards",
    intro: "Coastal Tamil Nadu faces cyclonic winds and storm surge, mainly between October and December.",
    before: [
      "Follow official TNSDMA and IMD bulletins — not social media speculation.",
      "Secure loose roofing sheets, signs and outdoor furniture.",
      "Keep an emergency bag with food, water, medicines, cash and chargers.",
      "Know the nearest designated shelter (never assume a school is a shelter).",
    ],
    during: [
      "Stay indoors, away from windows, and keep a safe distance from the coast.",
      "Do not venture out during the calm of the eye of the storm.",
      "Switch off gas and electricity if authorities advise evacuation.",
    ],
    after: [
      "Avoid downed power lines and damaged structures.",
      "Boil drinking water; supply may be contaminated for days.",
      "Register with relief authorities if you need assistance.",
    ],
  },
  {
    id: "electrical",
    title: "Electrical and fire hazards",
    intro: "Flooded streets can carry current from damaged poles and illegal connections.",
    before: [
      "Install an RCCB/MCB and a working fire extinguisher.",
      "Never run extension boards through wet areas.",
      "Keep electrical points above anticipated flood level.",
    ],
    during: [
      "Treat every fallen wire as live — stay at least 10 metres away.",
      "If water enters your home, switch off the main supply only if you can reach it safely.",
      "If a fire starts, evacuate first and call 101; smoke inhalation kills faster than flames.",
    ],
    after: [
      "Get electrical systems inspected before turning them back on.",
      "Report sparking poles or exposed wiring to the electricity board.",
      "Do not re-enter a fire-damaged building until cleared.",
    ],
  },
  {
    id: "landslide",
    title: "Landslides and hill-route hazards",
    intro: "Nilgiris, Kanyakumari and other hill districts are prone to rain-triggered slope failures.",
    before: [
      "Monitor rainfall forecasts before travelling on ghat roads.",
      "Identify escape routes away from steep slopes and streams.",
      "Notice new cracks in walls, doors that stick, or tilting trees — they can be warning signs.",
    ],
    during: [
      "Avoid ghat road travel during intense rain.",
      "If caught, move away from the slope and travel direction, not downhill.",
      "Report boulders or mud on the road with direction and kilometre marker.",
    ],
    after: [
      "Stay away from slide areas; secondary collapses are common.",
      "Follow highways department clearance instructions.",
      "Report structural damage before reoccupying a building.",
    ],
  },
  {
    id: "evacuation",
    title: "Evacuation and preparedness",
    intro: "Decide before the crisis, not during it.",
    before: [
      "Prepare a family emergency plan with a meeting point and a common contact.",
      "Keep photocopies of ID, insurance and medical records in a sealed bag.",
      "Learn the location of a genuinely official shelter near your home.",
      "Keep a 72-hour kit: food, water, medicines, torch, radio, charger, first aid.",
    ],
    during: [
      "Follow instructions from official responders; do not wait for a second confirmation.",
      "Switch off power, gas and water before leaving if safe.",
      "Help children, elderly and disabled people first.",
      "Lock your home and take the emergency bag only.",
    ],
    after: [
      "Register at the shelter so officials can account for you.",
      "Do not return until authorities declare the area safe.",
      "Keep an eye on authoritative updates and avoid rumours.",
    ],
  },
  {
    id: "report-help",
    title: "Reporting and seeking help responsibly",
    intro: "Accurate reports save time and lives. False reports consume scarce responder capacity.",
    before: [
      "Learn the difference between 112 (emergency), 108 (ambulance) and 101 (fire).",
      "Prepare your location details — a landmark is faster to find than coordinates alone.",
    ],
    during: [
      "Call emergency services first when lives are at risk; then submit an SOS for the coordination record.",
      "Be specific: depth, access, number of people and any special medical needs.",
      "Never forward unverified claims as official warnings.",
    ],
    after: [
      "Track your submission for status changes and provide follow-up information.",
      "If the situation resolves, update the duty officer so resources can be released.",
    ],
  },
  {
    id: "water-health",
    title: "Water safety and public health",
    intro: "Water-borne illness and vector-borne disease often rise after floods.",
    before: [
      "Store safe drinking water and household purification tablets if available.",
      "Keep sanitation supplies and ORS at home.",
    ],
    during: [
      "Do not drink tap water that has been flooded; use sealed bottled water if available.",
      "Wash hands frequently with soap, especially before food.",
      "Avoid walking barefoot over debris.",
    ],
    after: [
      "Boil water for at least one minute before drinking.",
      "Drain stagnant water around your home.",
      "Seek medical care for fever, diarrhoea or infected wounds.",
    ],
  },
  {
    id: "fire",
    title: "Fire safety and smoke",
    intro: "Most household fire deaths are caused by smoke inhalation, not flames. Get out first, then call for help.",
    before: [
      "Install a smoke alarm on each level and test it monthly.",
      "Keep a fire extinguisher near the kitchen and know how to use it.",
      "Never store fuel, paint or gas cylinders near cooking areas.",
      "Identify two exits from every room you sleep in.",
    ],
    during: [
      "Raise the alarm, get everyone out, and stay out.",
      "Call 101 (Fire & Rescue) or 112. Give the exact address and floor.",
      "Stay low under smoke and close doors behind you to slow its spread.",
      "Never re-enter a burning building for belongings.",
    ],
    after: [
      "Do not re-enter until the fire service declares it safe.",
      "Get burns cooled under running water for 20 minutes; do not apply oil or paste.",
      "Report electrical damage for inspection before power is restored.",
      "Replace smoke alarms that have been exposed to fire or water.",
    ],
  },
  {
    id: "heatwave",
    title: "Heatwave precautions",
    intro: "Heat stress builds over consecutive hot days. Elderly people, infants and outdoor workers are most at risk.",
    before: [
      "Keep drinking water accessible and avoid heavy outdoor work between 11:00 and 16:00.",
      "Check on elderly neighbours and anyone living alone.",
      "Use curtains and ventilation to keep living spaces cooler; never leave a child or pet in a parked vehicle.",
    ],
    during: [
      "Drink water even before you feel thirsty; avoid alcohol and very sugary drinks.",
      "Wear loose, light-coloured clothing and a hat if you must go outside.",
      "Rest in shade or a cooler indoor space and take breaks during physical work.",
      "Treat confusion, hot dry skin, fainting or no sweating as a medical emergency — call 108.",
    ],
    after: [
      "Keep hydrating after the peak heat; heat fatigue can persist.",
      "Check food that may have spoiled during power or refrigeration interruptions.",
      "Report heat-related illness clusters to the local health centre.",
    ],
  },
  {
    id: "general-preparedness",
    title: "General emergency preparedness",
    intro: "A few minutes of preparation today saves critical time during an emergency.",
    before: [
      "Save 112 (emergency), 108 (ambulance), 101 (fire) and 1078 (disaster control) in your phone.",
      "Keep an emergency bag: water, dry food, torch, power bank, medicines, copies of documents, cash.",
      "Agree a family meeting point and an out-of-area contact.",
      "Know your district's designated shelters and never assume a school or hall is one.",
    ],
    during: [
      "Follow instructions from official responders and local authorities.",
      "Report accurate information; false reports consume scarce response capacity.",
      "Keep phones charged and conserve battery; send short messages when networks are congested.",
    ],
    after: [
      "Check on vulnerable neighbours and register at relief centres if you need assistance.",
      "Photograph damage before cleaning up for relief claims.",
      "Never forward unverified claims as official warnings.",
    ],
  },
];

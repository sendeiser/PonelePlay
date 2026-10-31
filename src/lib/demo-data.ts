export const DEMO_SLUG = "billar-aurora";

export type TrackSource = "youtube" | "upload";

export type DemoTrack = {
  id: string;
  title: string;
  artist: string;
  source: TrackSource;
  duration: string;
  votes: number;
  proposedAt: number;
  explicit?: boolean;
};

export type DemoNowPlaying = DemoTrack & {
  elapsed: string;
  elapsedPct: number;
};

export const demoVenue = {
  name: "Billar Aurora",
  slug: DEMO_SLUG,
  tagline: "Pool bar & billares · Palermo",
  nightStartedAt: "21:04",
  initialCredits: 3,
  demoCode: "MESAPLAY",
};

export const demoNowPlaying: DemoNowPlaying = {
  id: "now-1",
  title: "De Música Ligera",
  artist: "Soda Stereo",
  source: "youtube",
  duration: "3:27",
  votes: 14,
  proposedAt: 0,
  elapsed: "1:14",
  elapsedPct: 36,
};

export const demoQueue: DemoTrack[] = [
  {
    id: "q-1",
    title: "El Farolito",
    artist: "Babasónicos",
    source: "youtube",
    duration: "4:12",
    votes: 12,
    proposedAt: 1,
  },
  {
    id: "q-2",
    title: "La Balada del Diablo y la Muerte",
    artist: "La Renga",
    source: "upload",
    duration: "5:04",
    votes: 9,
    proposedAt: 2,
  },
  {
    id: "q-3",
    title: "11 y 6",
    artist: "Fito Páez",
    source: "youtube",
    duration: "3:38",
    votes: 8,
    proposedAt: 3,
  },
  {
    id: "q-4",
    title: "Don",
    artist: "Miranda!",
    source: "youtube",
    duration: "3:08",
    votes: 5,
    proposedAt: 4,
  },
  {
    id: "q-5",
    title: "Givenchy",
    artist: "Duki",
    source: "youtube",
    duration: "3:12",
    votes: 3,
    proposedAt: 5,
  },
  {
    id: "q-6",
    title: "Mil Horas",
    artist: "Los Abuelos de la Nada",
    source: "upload",
    duration: "3:43",
    votes: 2,
    proposedAt: 6,
  },
];

export const demoSearchCatalog: DemoTrack[] = [
  {
    id: "s-1",
    title: "Me Gusta",
    artist: "Ciro y Los Persas",
    source: "youtube",
    duration: "4:12",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-2",
    title: "Seminare",
    artist: "Serú Girán",
    source: "youtube",
    duration: "4:11",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-3",
    title: "Lamento Boliviano",
    artist: "Los Enanitos Verdes",
    source: "youtube",
    duration: "3:42",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-4",
    title: "Muchacha Ojos de Papel",
    artist: "Almendra",
    source: "youtube",
    duration: "3:35",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-5",
    title: "Flaca",
    artist: "Andrés Calamaro",
    source: "youtube",
    duration: "4:06",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-6",
    title: "Un Osito de Peluche de Taiwán",
    artist: "Los Auténticos Decadentes",
    source: "upload",
    duration: "3:40",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-7",
    title: "Trátame Suavemente",
    artist: "Soda Stereo",
    source: "youtube",
    duration: "3:22",
    votes: 0,
    proposedAt: 0,
  },
  {
    id: "s-8",
    title: "Costumbres Argentinas",
    artist: "Los Abuelos de la Nada",
    source: "upload",
    duration: "3:12",
    votes: 0,
    proposedAt: 0,
  },
];

export const demoSearchSuggestions = [
  "Soda Stereo",
  "Babasónicos",
  "La Renga",
  "Fito Páez",
];

export const demoStats = {
  votes: 34,
  codes: 12,
  credits: 60,
};

export const demoPanelLog = [
  { time: "21:04", text: "Noche abierta por Luz", tone: "neutral" as const },
  { time: "21:11", text: "Código BOLA7K2M · 5 votos · Sofi", tone: "amber" as const },
  { time: "21:15", text: "Veto: «La Rubia Tarada»", tone: "coral" as const },
];

export function sortQueue(a: DemoTrack, b: DemoTrack) {
  return b.votes - a.votes || a.proposedAt - b.proposedAt;
}

export function formatVotes(count: number) {
  return `${count} ${count === 1 ? "voto" : "votos"}`;
}

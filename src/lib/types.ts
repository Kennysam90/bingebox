export type TitleType = 'movie' | 'series';

export interface CardTitle {
  id: number;
  slug: string;
  type: TitleType;
  title: string;
  tagline: string | null;
  synopsis: string;
  year: number | null;
  endYear: number | null;
  runtimeMin: number | null;
  maturity: string;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  genreSlugs: string[];
  rating: { score: number; count: number } | null;
  externalRating?: { score: number; count: number; source: 'IMDb' } | null;
  popularity: number;
  featured: boolean;
  createdAt: number;
  isNew: boolean;
  seasons: number;
  episodes: number;
  hasTrailer: boolean;
  rights: string;
}

export interface ContinueItem extends CardTitle {
  progress: { position: number; duration: number; fraction: number; updatedAt: number };
  episode: { id: number; name: string; season: number; number: number; label: string } | null;
  upNext: boolean;
}

export interface Row {
  id: string;
  title: string;
  subtitle?: string;
  kind?: 'standard' | 'top10' | 'poster' | 'continue';
  href?: string;
  items: CardTitle[] | ContinueItem[];
}

export interface Person {
  id: number;
  name: string;
  photo: string | null;
  role: string;
  character: string | null;
}

export interface Episode {
  id: number;
  number: number;
  name: string;
  synopsis: string | null;
  runtimeSec: number | null;
  still: string | null;
}

export interface Season {
  id: number;
  number: number;
  name: string;
  episodes: Episode[];
}

export interface TitleDetail {
  externalRating?: { score: number; count: number; source: 'IMDb' } | null;
  id: number;
  slug: string;
  type: TitleType;
  title: string;
  tagline: string | null;
  synopsis: string;
  about: string | null;
  releaseDate: string | null;
  year: number | null;
  endYear: number | null;
  runtimeMin: number | null;
  maturity: string;
  poster: string | null;
  backdrop: string | null;
  trailer: string | null;
  imdbId: string | null;
  wikidataId: string | null;
  country: string | null;
  language: string | null;
  tags: string[];
  rights: { kind: string; license: string | null; attribution: string | null; sourceUrl: string | null };
  synopsisSource: { name: string; url: string; license: string } | null;
  genres: { slug: string; name: string }[];
  rating: { score: number; count: number } | null;
  cast: Person[];
  crew: Person[];
  seasons: Season[];
  subtitleLanguages: string[];
  qualities: string[];
}

export interface TitleMe {
  inList: boolean;
  myRating: number | null;
  progress: { episodeId: number; position: number; duration: number; completed: number; updatedAt: number }[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: number;
}

export interface Profile {
  id: number;
  name: string;
  avatar: string;
  isKids: boolean;
}

export interface Session {
  user: User | null;
  profile: Profile | null;
  profiles: Profile[];
}

export interface Genre {
  posters?: (string | null)[];
  id: number;
  slug: string;
  name: string;
  description: string | null;
  count: number;
  image: string | null;
}

export interface PlaybackSource {
  codec?: string;
  url: string;
  kind: 'mp4' | 'hls';
  quality: string;
  primary: boolean;
}

export interface PlaybackEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  still: string | null;
  runtimeSec: number | null;
}

export interface Playback {
  title: { id: number; slug: string; type: TitleType; title: string; backdrop: string | null };
  episode: PlaybackEpisode | null;
  next: PlaybackEpisode | null;
  prev: PlaybackEpisode | null;
  sources: PlaybackSource[];
  subtitles: { id: number; lang: string; label: string; src: string }[];
  resume: { position: number; duration: number } | null;
}

export interface Paged<T> {
  totalExact?: boolean;
  nextPage?: number | null;
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore?: boolean;
}

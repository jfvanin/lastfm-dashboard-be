
// Define interfaces for the data structure
export interface Image {
  size: string;
  "#text": string;
}

export interface Artist {
  mbid: string;
  "#text": string;
}

export interface Album {
  mbid: string;
  "#text": string;
}

export interface DateInfo {
  uts?: string;
  "#text": string;
}

export interface Track {
  artist: Artist;
  streamable: string;
  image: Image[];
  mbid: string;
  album: Album;
  name: string;
  url?: string;
  date: DateInfo;
}

export interface ArtistInfo {
  artist: string;
  country: string;
  tags: string[];
}

export interface AlbumInfo {
  album: string;
  year?: number;
}

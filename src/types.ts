import {firestore} from "firebase-admin";

export type User = {
  last_cursor?: string;
  refresh_token: string;
  created_date: string;
  last_updated: string;
  id: string;
  code_verifier: string;
  auth_code: string;
  redirect_uri: string;
  collect_additional_info: boolean;
  total_listen_time_ms: number;
  total_plays: number;
  available_months: AvailableMonth[];
}

export type AccessTokenResponse = {
  access_token: string;
  refresh_token: string;
}

export type Session = {
  start_time: string;
  end_time: string;
  latest_play: firestore.DocumentReference;
  play_references: firestore.DocumentReference[];
  duration_ms: number;
}

export type ListenInfo = {
  uid?: string;
  listens: firestore.DocumentReference[];
  listen_count?: number;
}

export type Song = SpotifyApi.TrackObjectFull & ListenInfo;

export type Album = SpotifyApi.AlbumObjectSimplified & ListenInfo;

export type Artist = SpotifyApi.ArtistObjectSimplified & ListenInfo;

export type ArtistFull = SpotifyApi.ArtistObjectFull & ListenInfo;

export type PlayResult = SpotifyApi.PlayHistoryObject & {
  session?: firestore.DocumentReference;
};

export type Play = {
  id: string;
  name: string;
  artists: {name: string; id: string}[];
  album: {name: string; id: string; image: string;};
  played_at: string;
  duration_ms: number;
  popularity: number;
  session?: firestore.DocumentReference;
  context?: any;
}

export type Month = {
  id: number;
  total_listen_time_ms: number;
  total_plays: number;
  total_songs: number;
  total_albums: number;
  total_artists: number;
  avg_minutes_per_day: number;
  most_listened_song: Song;
  most_listened_album: Album;
  most_listened_artist: ArtistFull;
  most_listened_day: {
    day: string;
    listen_time_ms: number;
  }
  playlist_id?: string;
}

export type AvailableMonth = {
  collection: string;
  id: number;
  month: number;
  month_name: string;
};


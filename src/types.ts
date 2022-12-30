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

export type Track = SpotifyApi.PlayHistoryObject;

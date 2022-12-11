import {firestore} from "firebase-admin";
import {spotifyConfig} from "./config";
import SpotifyWebApi from "spotify-web-api-node";
import {User} from "./types";
import {getAccessToken, refreshAccessToken} from "./spotifyHelper";
import {FieldValue} from "firebase-admin/firestore";

const db = firestore();
const spotifyApi = new SpotifyWebApi(spotifyConfig);

export const getRecentListens = async () => {
  console.log("getRecentListens", new Date().toDateString());
  const users = await db.collection("User").get();
  console.log("getRecentListens users", users.docs.length);
  getUserRecentListens(users.docs, 0);
};

const getUserRecentListens = async (users: firestore.QueryDocumentSnapshot<firestore.DocumentData>[], i: number) => {
  console.log("getUserRecentListens", new Date().toISOString());
  if (i >= users.length) return;

  const user = {...users[i].data(), id: users[i].id} as User;
  console.log(JSON.stringify(user));

  const accessTokenRes = await refreshAccessToken(user.refresh_token);
  console.log(accessTokenRes);
  spotifyApi.setAccessToken(accessTokenRes.access_token);

  await getAllRecentlyPlayedByUser(user);
  setTimeout(() => getUserRecentListens(users, i + 1), 10000);
};


const getAllRecentlyPlayedByUser = async (user: User) => {
  console.log("getAllRecentlyPlayedByUser");
  const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 50, after: parseInt(user.last_cursor ?? "0")});
  console.log("mostRecent", mostRecent?.body?.items?.length);
  const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t));
  newRecentTracks.sort((t1, t2)=> t1.played_at > t2.played_at ? 1 : -1)
      .forEach((track, i) => setTimeout(() => sendTrackToDB(track, user.id), 500 * i));
  db.collection("User").doc(user.id).update({
    last_updated: new Date().toISOString(),
    ...(newRecentTracks.length ? {last_cursor: mostRecent.body.cursors.after} : {}),
  });
};

const cleanTrack = (track: SpotifyApi.PlayHistoryObject): SpotifyApi.PlayHistoryObject => {
  const cleanedTrack = track;
  cleanedTrack.track.available_markets = ["US"];
  cleanedTrack.track.album.available_markets = ["US"];

  return cleanedTrack;
};

const sendTrackToDB = (track: SpotifyApi.PlayHistoryObject, userId: string) => {
  console.log("sendTrackToDB", track.track.name, userId);
  db.collection("User").doc(userId).collection("Plays").add(track);
};

export const initializeSpotify = async (user: User) => {
  console.log("Initializing Spotify for ", user);

  spotifyApi.setRefreshToken(user.auth_code);
  const accessTokenRes = await getAccessToken(user.auth_code, user.code_verifier);
  console.log(accessTokenRes);
  spotifyApi.setAccessToken(accessTokenRes.access_token);
  await db.collection("User").doc(user.id).update({
    refresh_token: accessTokenRes.refresh_token,
    auth_code: FieldValue.delete(),
    code_verifier: FieldValue.delete(),
  });

  getAllRecentlyPlayedByUser(user);
};

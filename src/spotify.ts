import {firestore} from "firebase-admin";
import {spotifyConfig} from "./config";
import SpotifyWebApi from "spotify-web-api-node";
import {User} from "./types";
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

  if (!user.refresh_token) {
    getUserRecentListens(users, i + 1);
  } else {
    spotifyApi.setRefreshToken(user.refresh_token);
    const accessTokenRes = await spotifyApi.refreshAccessToken();
    console.log(accessTokenRes);
    spotifyApi.setAccessToken(accessTokenRes.body.access_token);

    await getAllRecentlyPlayedByUser(user);
    setTimeout(() => getUserRecentListens(users, i + 1), 5000);
  }
};


const getAllRecentlyPlayedByUser = async (user: User) => {
  console.log("getAllRecentlyPlayedByUser");
  const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 50, after: parseInt(user.last_cursor ?? "0")});
  console.log("mostRecent", mostRecent?.body?.items?.length);
  const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t));
  newRecentTracks.sort((t1, t2)=> t1.played_at > t2.played_at ? 1 : -1)
      .forEach((track) => sendTrackToDB(track, user.id));
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

  const accessTokenRes = await spotifyApi.authorizationCodeGrant(user.auth_code);
  console.log(accessTokenRes);
  spotifyApi.setAccessToken(accessTokenRes.body.access_token);
  await db.collection("User").doc(user.id).update({
    refresh_token: accessTokenRes.body.refresh_token,
    auth_code: FieldValue.delete(),
  });

  getAllRecentlyPlayedByUser(user);
};

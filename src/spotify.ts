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
  console.log(`gRL users, ${users.docs.length}`);
  getUserRecentListens(users.docs, 0);
};

const getUserRecentListens = async (users: firestore.QueryDocumentSnapshot<firestore.DocumentData>[], i: number) => {
  console.log(`getUserRecentListens, ${i}, ${users.length}`);
  if (i >= users.length) return;

  const user = {...users[i].data(), id: users[i].id} as User;
  console.log(`gURL USER, ${JSON.stringify(user)}`);

  if (!user.refresh_token) {
    console.log(`gURL NO TOKEN, ${user.id}`);
    getUserRecentListens(users, i + 1);
  } else {
    try {
      spotifyApi.setRefreshToken(user.refresh_token);
      const accessTokenRes = await spotifyApi.refreshAccessToken();
      console.log(`gURL ACCESS TOKEN RES, ${JSON.stringify(accessTokenRes.body)}`);
      spotifyApi.setAccessToken(accessTokenRes.body.access_token);

      const gARPBU = await getAllRecentlyPlayedByUser(user);
      console.log(`gARPBU result: ${gARPBU} for ${user.id}`);
    } catch (e) {
      console.log(`gURL ERROR, ${JSON.stringify(e)}`);
    } finally {
      setTimeout(() => getUserRecentListens(users, i + 1), 5000);
    }
  }
};


const getAllRecentlyPlayedByUser = async (user: User): Promise<string> => {
  console.log(`getAllRecentlyPlayedByUser, ${user.id}`);
  try {
    const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 50, after: parseInt(user.last_cursor ?? "0")});
    console.log(`gARPBU mostRecent, ${mostRecent?.body?.items?.length}`);
    const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t));
    await Promise.all(newRecentTracks.sort((t1, t2)=> t1.played_at > t2.played_at ? 1 : -1)
        .map((track) => sendTrackToDB(track, user.id)));
    await db.collection("User").doc(user.id).update({
      last_updated: new Date().toISOString(),
      ...(newRecentTracks.length ? {last_cursor: mostRecent.body.cursors.after} : {}),
    });
    return "SUCCESS";
  } catch (e) {
    console.log(`gARPBU ERROR, ${JSON.stringify(e)}`);
    return "FAIL";
  }
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

import {firestore} from "firebase-admin";
import {spotifyConfig} from "./config";
import SpotifyWebApi from "spotify-web-api-node";
import {Track, User} from "./types";
import {FieldValue} from "firebase-admin/firestore";
import {calculateSessions} from "./session";

const db = firestore();

export const getRecentListens = async () => {
  console.log("getRecentListens", new Date().toDateString());
  const users = await db.collection("User").get();
  console.log(`gRL users, ${users.docs.length}`);
  const spotifyApi = new SpotifyWebApi(spotifyConfig());
  getUserRecentListens(users.docs, 0, spotifyApi);
};

const getUserRecentListens = async (users: firestore.QueryDocumentSnapshot<firestore.DocumentData>[], i: number, spotifyApi: SpotifyWebApi) => {
  if (i >= users.length) return;

  const user = {...users[i].data(), id: users[i].id} as User;
  console.log(`gURL USER ${i} ${user.id}}`);

  if (!user.refresh_token) {
    console.log(`gURL NO TOKEN, ${user.id}`);
    getUserRecentListens(users, i + 1, spotifyApi);
  } else {
    try {
      spotifyApi.setRefreshToken(user.refresh_token);
      const accessTokenRes = await spotifyApi.refreshAccessToken();
      // console.log(`gURL ACCESS TOKEN RES, ${JSON.stringify(accessTokenRes.body)}`);
      spotifyApi.setAccessToken(accessTokenRes.body.access_token);

      console.time("garpbu " + user.id);
      await getAllRecentlyPlayedByUser(user, spotifyApi);
      console.timeEnd("garpbu " + user.id);
      // console.log(`gARPBU result: ${gARPBU} for ${user.id}`);
    } catch (e) {
      console.log(`gURL ERROR, ${JSON.stringify(e)}`);
    } finally {
      setTimeout(() => getUserRecentListens(users, i + 1, spotifyApi), 1000);
    }
  }
};

const getAllRecentlyPlayedByUser = async (user: User, spotifyApi: SpotifyWebApi): Promise<string> => {
  // console.log(`gARPBU, ${user.id}`);
  try {
    // console.log(`gARPBU spotify access token set, ${spotifyApi.getAccessToken()}`);
    console.time("getMostRecent " + user.id);
    const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 15, after: parseInt(user.last_cursor ?? "0")});
    console.timeEnd("getMostRecent " + user.id);
    // console.log(`gARPBU mostRecent, ${mostRecent?.body?.items?.length}`);
    if (mostRecent?.body?.items?.length) {
      const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t));
      const sortedTracks = newRecentTracks.slice().sort((t1, t2)=> t1.played_at > t2.played_at ? 1 : -1);

      console.time("sendTracksToDB " + user.id);
      const batch = db.batch();
      sortedTracks.forEach((track) => {
        const ref = db.collection("User").doc(user.id).collection("Plays").doc();
        batch.set(ref, track);
      });
      await batch.commit();
      console.timeEnd("sendTracksToDB " + user.id);

      console.time("updateLastCursor " + user.id);
      await db.collection("User").doc(user.id).update({
        last_updated: new Date().toISOString(),
        ...(newRecentTracks.length ? {last_cursor: mostRecent.body.cursors.after} : {}),
      });
      console.timeEnd("updateLastCursor " + user.id);
      calculateSessions(user);
      return "SUCCESS " + mostRecent?.body?.items?.length;
    }
    calculateSessions(user);
    return "SUCCESS NONE";
  } catch (e) {
    console.log(`gARPBU ERROR, ${JSON.stringify(e)}`);
    return "FAIL";
  }
};

const cleanTrack = (track: Track): Track => {
  const cleanedTrack = track;
  cleanedTrack.track.available_markets = ["US"];
  cleanedTrack.track.album.available_markets = ["US"];

  return cleanedTrack;
};

export const initializeSpotify = async (user: User) => {
  console.log("Initializing Spotify for ", user);

  const spotifyApi = new SpotifyWebApi(spotifyConfig(user.redirect_uri));
  const accessTokenRes = await spotifyApi.authorizationCodeGrant(user.auth_code);
  console.log(`init ACCESS TOKEN RES, ${JSON.stringify(accessTokenRes.body)}`);
  spotifyApi.setAccessToken(accessTokenRes.body.access_token);
  await db.collection("User").doc(user.id).update({
    refresh_token: accessTokenRes.body.refresh_token,
    auth_code: FieldValue.delete(),
    redirect_uri: FieldValue.delete(),
    spotify_state: FieldValue.delete(),
  });

  getAllRecentlyPlayedByUser(user, spotifyApi);
};

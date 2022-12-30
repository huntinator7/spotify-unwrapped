import {firestore} from "firebase-admin";
import {spotifyConfig} from "../config";
import SpotifyWebApi from "spotify-web-api-node";
import {User} from "../types";
import {FieldValue} from "firebase-admin/firestore";
import {calculateSessions} from "./sessions";
import {queries} from "../scripts/queries";
import {cleanTrack} from "../scripts/helpers";

export const getRecentListens = async () => {
  console.log("getRecentListens", new Date().toDateString());
  const users = await queries.getUsers();
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
      spotifyApi.setAccessToken(accessTokenRes.body.access_token);

      await getAllRecentlyPlayedByUser(user, spotifyApi);
    } catch (e) {
      console.log(`gURL ERROR, ${JSON.stringify(e)}`);
    } finally {
      setTimeout(() => getUserRecentListens(users, i + 1, spotifyApi), 1000);
    }
  }
};

const getAllRecentlyPlayedByUser = async (user: User, spotifyApi: SpotifyWebApi): Promise<string> => {
  try {
    const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 15, after: parseInt(user.last_cursor ?? "0")});
    console.timeEnd("getMostRecent " + user.id);
    if (mostRecent?.body?.items?.length) {
      const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t));
      const sortedTracks = newRecentTracks.slice().sort((t1, t2)=> t1.played_at > t2.played_at ? 1 : -1);

      console.time("sendTracksToDB " + user.id);
      queries.doBatch(async (batch, db) => {
        sortedTracks.forEach((track) => {
          const ref = db.collection("User").doc(user.id).collection("Plays").doc();
          batch.set(ref, track);
        });
      });
      console.timeEnd("sendTracksToDB " + user.id);

      console.time("updateLastCursor " + user.id);
      await queries.updateUserLastUpdated(
          user.id,
          new Date().toISOString(),
        newRecentTracks.length ? {last_cursor: mostRecent.body.cursors.after} : {}
      );
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

export const initializeSpotify = async (user: User) => {
  console.log("Initializing Spotify for ", user);

  const spotifyApi = new SpotifyWebApi(spotifyConfig(user.redirect_uri));
  const accessTokenRes = await spotifyApi.authorizationCodeGrant(user.auth_code);
  console.log(`init ACCESS TOKEN RES, ${JSON.stringify(accessTokenRes.body)}`);
  spotifyApi.setAccessToken(accessTokenRes.body.access_token);
  await queries.updateUser(user.id, {
    refresh_token: accessTokenRes.body.refresh_token,
    auth_code: FieldValue.delete(),
    redirect_uri: FieldValue.delete(),
    spotify_state: FieldValue.delete(),
  });

  getAllRecentlyPlayedByUser(user, spotifyApi);
};

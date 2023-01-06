import {firestore} from "firebase-admin";
import {spotifyConfig} from "../config";
import SpotifyWebApi from "spotify-web-api-node";
import {User} from "../types";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
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

const getUserRecentListens = async (users: firestore.QueryDocumentSnapshot<User>[], i: number, spotifyApi: SpotifyWebApi) => {
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
    if (mostRecent?.body?.items?.length) {
      const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t));
      const newPlays = newRecentTracks.map(({play}) => play);

      console.time("sendPlaysToDB " + user.id);
      const db = getFirestore();
      try {
        await db.runTransaction(async (tx) => {
          const songRefs = newRecentTracks.map(({play, song}) => ({
            play,
            song,
            album: song.album,
            playRef: db.collection("User").doc(user.id).collection("Plays").doc(),
            songRef: db.collection("Songs").doc(song.id),
            albumRef: db.collection("Albums").doc(song.album.id),
            userSongRef: db.collection("User").doc(user.id).collection("UserSongs").doc(song.id),
            userAlbumRef: db.collection("User").doc(user.id).collection("UserAlbums").doc(song.album.id),
          }));
          const songRefRes = await Promise.all(songRefs.map(async (ref) => ({
            ...ref,
            songRes: await tx.get(ref.songRef),
            albumRes: await tx.get(ref.albumRef),
            userSongRes: await tx.get(ref.userSongRef),
            userAlbumRes: await tx.get(ref.userAlbumRef),
          })));
          songRefRes.forEach((song) => {
            if (song.userSongRes?.exists) {
              console.log("user song exists", song.userSongRes.id);
              tx.update(song.userSongRef, {
                listens: FieldValue.arrayUnion(song.playRef),
              });
            } else {
              console.log(`user song doesn't exist, creating ${song.userSongRef.path}`);
              tx.set(song.userSongRef, {...song.song, uid: user.id, listens: [song.playRef]});
            }
            if (song.userAlbumRes?.exists) {
              console.log("user album exists", song.userSongRes.id);
              tx.update(song.userAlbumRef, {
                listens: FieldValue.arrayUnion(song.playRef),
              });
            } else {
              console.log(`user album doesn't exist, creating ${song.userAlbumRef.path}`);
              tx.set(song.userAlbumRef, {...song.album, uid: user.id, listens: [song.playRef]});
            }
            if (song.songRes?.exists) {
              console.log("song exists", song.userSongRes.id);
              tx.update(song.songRef, {
                listens: FieldValue.arrayUnion(song.playRef),
              });
            } else {
              console.log(`song doesn't exist, creating ${song.songRef.path}`);
              tx.set(song.songRef, {...song.song, listens: [song.playRef]});
            }
            if (song.albumRes?.exists) {
              console.log("album exists", song.userSongRes.id);
              tx.update(song.albumRef, {
                listens: FieldValue.arrayUnion(song.playRef),
              });
            } else {
              console.log(`album doesn't exist, creating ${song.albumRef.path}`);
              tx.set(song.albumRef, {...song.album, listens: [song.playRef]});
            }
            console.log(`creating play ${song.playRef.path}`);
            tx.set(song.playRef, song.play);
          });
          const userRef = db.collection("User").doc(user.id);
          console.log(`updating user ${userRef.path}`);
          console.log(`updating user ${userRef.path}`);
          tx.update(userRef, {
            last_updated: new Date().toISOString(),
            total_listen_time_ms: FieldValue.increment(newPlays.map((t) => t.duration_ms).reduce((a, c) => a + c, 0)),
            total_plays: FieldValue.increment(newPlays.length),
            ...(newPlays.length ? {last_cursor: mostRecent.body.cursors.after} : {}),
          });
        });
        calculateSessions(user);
        console.timeEnd("sendPlaysToDB " + user.id);
        return "SUCCESS " + mostRecent?.body?.items?.length;
      } catch (e) {
        console.log("tx error", e);
        Promise.reject(e);
        return "FAIL";
      }
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

export async function shrinkPlays(start = "2022-12-08", index = 0, limit = 10) {
  console.time("getPlaysShrink" + index);
  const querySnapshot = await queries.getPlaysShrink(start);
  console.timeEnd("getPlaysShrink" + index);

  console.time("batch" + index);
  await queries.doBatch(async (batch, db) => {
    querySnapshot.forEach(async (doc) => {
      console.log(doc.id);
      if (doc.data().track) {
        console.log(`modifying ${doc.id}`);
        // is old object, modify and create song
        const {song, play} = cleanTrack(doc.data());
        batch.set(doc.ref, play);
        batch.set(db.collection("Songs").doc(song.id), song);
      }
    });
  });
  console.timeEnd("batch" + index);

  index++;
  if (index < limit) {
    console.log(`calling again with ${index} starting ${querySnapshot.docs.at(-1)?.data().played_at}`);
    shrinkPlays(querySnapshot.docs.at(-1)?.data().played_at, index, limit);
  }
}

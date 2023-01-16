import {firestore} from "firebase-admin";
import {spotifyConfig} from "../config";
import SpotifyWebApi from "spotify-web-api-node";
import {User} from "../types";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {calculateSessions} from "./sessions";
import {queries} from "../scripts/queries";
import {cleanTrack} from "../scripts/helpers";

export async function getRecentListens() {
  console.log("getRecentListens", new Date().toDateString());
  const users = await queries.getUsers();
  console.log(`gRL users, ${users.docs.length}`);
  return await getUserRecentListens(users.docs);
}

async function getUserRecentListens(users: firestore.QueryDocumentSnapshot<User>[]) {
  return await Promise.all(users.map(async (u) => {
    const user = {...u.data(), id: u.id} as User;
    if (!user.refresh_token) {
      return Promise.resolve(`${u.id}: "No token"`);
    }

    const spotifyApi = new SpotifyWebApi(spotifyConfig());
    spotifyApi.setRefreshToken(user.refresh_token);
    const accessTokenRes = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(accessTokenRes.body.access_token);

    const res = await getAllRecentlyPlayedByUser(user, spotifyApi);
    return `${u.id}: ${res}`;
  }));
}

async function getAllRecentlyPlayedByUser(user: User, spotifyApi: SpotifyWebApi): Promise<string> {
  try {
    const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 15, after: parseInt(user.last_cursor ?? "0")});
    if (mostRecent?.body?.items?.length) {
      const newRecentTracks = mostRecent?.body?.items?.map((t) => cleanTrack(t, user.id));
      const newPlays = newRecentTracks.map(({play}) => play);

      console.time("sendPlaysToDB " + user.id);
      const db = getFirestore();
      try {
        await db.runTransaction(async (tx) => {
          const songRefs = newRecentTracks.map(({play, song}) => ({
            play,
            song,
            album: song.album,
            artists: song.artists,
            playRef: db.collection("User").doc(user.id).collection("Plays").doc(),
            songRef: db.collection("Songs").doc(song.id),
            albumRef: db.collection("Albums").doc(song.album.id),
            artistRefs: song.artists.map((artist) => db.collection("Artists").doc(artist.id)),
            userSongRef: db.collection("User").doc(user.id).collection("UserSongs").doc(song.id),
            userAlbumRef: db.collection("User").doc(user.id).collection("UserAlbums").doc(song.album.id),
            userArtistRefs: song.artists.map((artist) => db.collection("User").doc(user.id).collection("UserArtists").doc(artist.id)),
          }));
          const songRefRes = await Promise.all(songRefs.map(async (ref) => ({
            ...ref,
            songRes: await tx.get(ref.songRef),
            albumRes: await tx.get(ref.albumRef),
            artistsRes: await Promise.all(ref.artistRefs.map((r) => (tx.get(r)))),
            userSongRes: await tx.get(ref.userSongRef),
            userAlbumRes: await tx.get(ref.userAlbumRef),
            userArtistsRes: await Promise.all(ref.userArtistRefs.map((r) => tx.get(r))),
          })));
          songRefRes.forEach((song) => {
            if (song.userSongRes?.exists) {
              tx.update(song.userSongRef, {
                listens: FieldValue.arrayUnion(song.playRef),
                listen_count: FieldValue.increment(1),
              });
            } else {
              tx.set(song.userSongRef, {...song.song, uid: user.id, listens: [song.playRef], listen_count: 1});
            }
            if (song.userAlbumRes?.exists) {
              tx.update(song.userAlbumRef, {
                listens: FieldValue.arrayUnion(song.playRef),
                listen_count: FieldValue.increment(1),
              });
            } else {
              tx.set(song.userAlbumRef, {...song.album, uid: user.id, listens: [song.playRef], listen_count: 1});
            }
            song.userArtistsRes.forEach((userArtistRes) => {
              const userArtistRef = song.userArtistRefs.find((r) => r.id === userArtistRes.id);
              if (!userArtistRef) {
                console.log("userArtistRef not found: " + userArtistRes?.id);
                return;
              }
              if (userArtistRes?.exists) {
                tx.update(userArtistRef, {
                  listens: FieldValue.arrayUnion(song.playRef),
                  listen_count: FieldValue.increment(1),
                });
              } else {
                const artist = song.artists.find((a) => a.id === userArtistRef.id);
                tx.set(userArtistRef, {...artist, listens: [song.playRef], listen_count: 1});
              }
            });
            if (song.songRes?.exists) {
              tx.update(song.songRef, {
                listens: FieldValue.arrayUnion(song.playRef),
                listen_count: FieldValue.increment(1),
              });
            } else {
              tx.set(song.songRef, {...song.song, listens: [song.playRef], listen_count: 1});
            }
            if (song.albumRes?.exists) {
              tx.update(song.albumRef, {
                listens: FieldValue.arrayUnion(song.playRef),
                listen_count: FieldValue.increment(1),
              });
            } else {
              tx.set(song.albumRef, {...song.album, listens: [song.playRef], listen_count: 1});
            }
            song.artistsRes.forEach((artistRes) => {
              const artistRef = song.artistRefs.find((r) => r.id === artistRes.id);
              if (!artistRef) {
                console.log("artistRef not found: " + artistRes?.id);
                return;
              }
              if (artistRes?.exists) {
                tx.update(artistRef, {
                  listens: FieldValue.arrayUnion(song.playRef),
                  listen_count: FieldValue.increment(1),
                });
              } else {
                const artist = song.artists.find((a) => a.id === artistRef.id);
                tx.set(artistRef, {...artist, listens: [song.playRef], listen_count: 1});
              }
            });
            tx.set(song.playRef, song.play);
          });
          const userRef = db.collection("User").doc(user.id);
          tx.update(userRef, {
            last_updated: new Date().toISOString(),
            total_listen_time_ms: FieldValue.increment(newPlays.map((t) => t.duration_ms).reduce((a, c) => a + c, 0)),
            total_plays: FieldValue.increment(newPlays.length),
            ...(newPlays.length ? {last_cursor: mostRecent.body.cursors.after} : {}),
          });
        });
        await calculateSessions(user);
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
}

export async function initializeSpotify(user: User) {
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
}

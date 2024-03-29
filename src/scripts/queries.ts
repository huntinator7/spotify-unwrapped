import {Firestore, getFirestore, QuerySnapshot, DocumentSnapshot, DocumentReference, QueryDocumentSnapshot, FieldValue, UpdateData, WriteBatch, Transaction} from "firebase-admin/firestore";
import {getEndTime, numTo2Digit} from "./helpers";
import {Album, Artist, Month, Play, Session, Song, User} from "../types";
const db = getFirestore();

function getUser(userId: string) {
  return db.collection("User").doc(userId).get() as Promise<QueryDocumentSnapshot<User>>;
}

function getUsers() {
  return db.collection("User").get() as Promise<QuerySnapshot<User>>;
}

async function getSecret(secret: string) {
  return (await db.collection("Secrets").doc("root").get()).get(secret);
}

async function getSession(userId: string, sessionId: string) {
  return db.collection("User").doc(userId).collection("Sessions").doc(sessionId).get();
}

async function getSessions(userId: string) {
  return db.collection("User").doc(userId).collection("Sessions").get();
}

async function getLatestSession(userId: string) {
  return db.collection("User").doc(userId).collection("Sessions").orderBy("end_time", "desc").limit(1).get();
}

async function getNextSession(userId: string, lastSession: DocumentSnapshot<Session>) {
  return db.collection("User").doc(userId).collection("Sessions")
      .orderBy("end_time", "desc")
      .startAfter(lastSession)
      .limit(1)
      .get();
}

async function getSong(songId: string) {
  return db.collection("Songs").doc(songId).get() as Promise<QueryDocumentSnapshot<Song>>;
}

async function getSongs() {
  return db.collection("Songs").get() as Promise<QuerySnapshot<Song>>;
}

async function getAlbum(albumId: string) {
  return db.collection("Albums").doc(albumId).get() as Promise<QueryDocumentSnapshot<Album>>;
}

async function getAlbums() {
  return db.collection("Albums").get() as Promise<QuerySnapshot<Album>>;
}

async function getArtist(artistId: string) {
  return db.collection("Artists").doc(artistId).get() as Promise<QueryDocumentSnapshot<Artist>>;
}

async function getArtists() {
  return db.collection("Artists").get() as Promise<QuerySnapshot<Artist>>;
}

async function getUserSongs(userId: string) {
  return db.collection("User").doc(userId).collection("UserSongs").get() as Promise<QuerySnapshot<Song>>;
}

async function getAllUserSongs() {
  return db.collectionGroup("UserSongs").get() as Promise<QuerySnapshot<Song>>;
}

async function getUserAlbums(userId: string) {
  return db.collection("User").doc(userId).collection("UserAlbums").get() as Promise<QuerySnapshot<Album>>;
}

async function getAllUserAlbums() {
  return db.collectionGroup("UserAlbums").get() as Promise<QuerySnapshot<Album>>;
}

async function getUserArtists(userId: string) {
  return db.collection("User").doc(userId).collection("UserArtists").get() as Promise<QuerySnapshot<Artist>>;
}

async function getPlays(userId: string) {
  return db.collection("User").doc(userId).collection("Plays").get() as Promise<QuerySnapshot<Play>>;
}

async function getPlaysForMonth(userId: string, month: number) {
  return db.collection("User").doc(userId).collection("Plays")
      .orderBy("played_at", "asc")
      .where("played_at", ">=", `2023-${numTo2Digit(month)}-01`)
      .where("played_at", "<", `2023-${numTo2Digit(month+1)}-01`)
      .get() as Promise<QuerySnapshot<Play>>;
}

async function getAllPlays() {
  return db.collectionGroup("Plays").get() as Promise<QuerySnapshot<Play>>;
}

async function getNextPlay(userId: string, lastPlay: DocumentSnapshot<Play>) {
  return (await db.collection("User").doc(userId).collection("Plays")
      .orderBy("played_at", "asc")
      .startAfter(lastPlay)
      .limit(1)
      .get() as QuerySnapshot<Play>)?.docs[0];
}

async function getFirstPlay(userId: string) {
  return (await db.collection("User").doc(userId).collection("Plays")
      .orderBy("played_at", "asc")
      .limit(1)
      .get() as QuerySnapshot<Play>)?.docs[0];
}

async function getPlaysBefore(userId: string, before: string) {
  return db.collection("User").doc(userId).collection("Plays").where("played_at", "<=", before).get() as Promise<QuerySnapshot<Play>>;
}

async function getSessionsInInterval(startTime: string, endTime: string) {
  return db.collectionGroup("Sessions").where("start_time", ">=", startTime).where("start_time", "<", endTime).get() as Promise<QuerySnapshot<Session>>;
}

async function getPlaysShrink(start: string) {
  return db.collectionGroup("Plays").orderBy("played_at").startAfter(start).limit(20).get() as Promise<QuerySnapshot<Play>>;
}

async function getMonth(userId: string, month: string) {
  return db.collection("User").doc(userId).collection("Months").doc(month).get() as Promise<QueryDocumentSnapshot<Month>>;
}

async function getTopSongs(userId: string, month: string) {
  return db.collection("User").doc(userId).collection("Months").doc(month).collection("TopSongs").get() as Promise<QuerySnapshot<Song>>;
}

function createUser(userId: string) {
  return db.collection("User").doc(userId).set({
    created_date: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    public: false,
    collect_additional_info: false,
    available_months: [],
  }, {merge: true});
}

function createSession(userId: string, payload: Record<string, any>) {
  return db.collection("User").doc(userId).collection("Sessions").add(payload) as Promise<DocumentReference<Session>>;
}

function createSessionFromPlay(userId: string, play: QueryDocumentSnapshot<Play>) {
  return createSession(userId, {
    start_time: play.data().played_at,
    end_time: new Date(getEndTime(play.data())).toISOString(),
    play_references: FieldValue.arrayUnion(play.ref),
    latest_play: play.ref,
    duration_ms: play.data().duration_ms,
  });
}

function createAggSession(month: string, day: string, timestamps: Record<string, number>) {
  return db.collection("Aggregated").doc("NumSessions").collection(month).doc(day).set(timestamps);
}

function createSong(song: Song) {
  return db.collection("Songs").doc(song.id).set(song);
}

function createMonth(userId: string, month: Month) {
  return db.collection("User").doc(userId).collection("Months").doc(numTo2Digit(month.id)).set(month);
}

function createMonthSong(userId: string, month: number, song: Song) {
  return db.collection("User").doc(userId).collection("Months").doc(numTo2Digit(month)).collection("TopSongs").doc(song.id).set(song);
}

function updateUser(userId: string, payload: Record<string, any>) {
  return db.collection("User").doc(userId).update(payload);
}

function updatePlay(userId: string, playId: string, payload: Record<string, any>) {
  return db.collection("User").doc(userId).collection("Plays").doc(playId).update(payload);
}

function updateSession(userId: string, sessionId: string, payload: UpdateData) {
  return db.collection("User").doc(userId).collection("Sessions").doc(sessionId).update(payload);
}

function updateUserLastUpdated(userId: string, last_updated: string, additionalFields: Record<string, any>) {
  return updateUser(userId,
      {
        last_updated,
        ...additionalFields,
      }
  );
}

function updateAggSession(month: string, day: string, timestamp: {[key: string]: number}) {
  return db.collection("Aggregated").doc("NumSessions").collection(month).doc(day).update(timestamp);
}

async function updateMonth(userId: string, month: string, monthUpdate: Partial<Month>) {
  return db.collection("User").doc(userId).collection("Months").doc(month).update(monthUpdate);
}

function deleteSession(userId: string, sessionId: string) {
  return db.collection("User").doc(userId).collection("Sessions").doc(sessionId).delete();
}

function setArtist(artistId: string, artist: Artist) {
  return db.collection("Artists").doc(artistId).set(artist);
}

function setUserArtist(userId: string, artistId: string, artist: Artist) {
  return db.collection("User").doc(userId).collection("UserArtists").doc(artistId).set(artist);
}

function setPlay(userId: string, playId: string, play: Play) {
  return db.collection("User").doc(userId).collection("Plays").doc(playId).set(play);
}

function setByRef(ref: DocumentReference, item: any) {
  return ref.set(item);
}

function updateByRef(ref: DocumentReference, update: any) {
  return ref.update(update);
}

async function doBatch(cb: (batch: WriteBatch, db: Firestore) => Promise<void>) {
  const batch = db.batch();
  await cb(batch, db);
  return batch.commit();
}

async function transaction(cb: (transaction: Transaction, db: Firestore) => Promise<void>) {
  try {
    return db.runTransaction(async (t) => {
      cb(t, db);
    });
  } catch (e) {
    console.log("tx error", e);
    return Promise.reject(e);
  }
}

export const queries = {
  getUser,
  getUsers,
  getSecret,
  getSession,
  getSessions,
  getNextSession,
  getLatestSession,
  getSong,
  getSongs,
  getAlbum,
  getAlbums,
  getArtist,
  getArtists,
  getUserSongs,
  getAllUserSongs,
  getUserAlbums,
  getAllUserAlbums,
  getUserArtists,
  getPlays,
  getPlaysForMonth,
  getAllPlays,
  getNextPlay,
  getFirstPlay,
  getPlaysBefore,
  getSessionsInInterval,
  getPlaysShrink,
  getMonth,
  getTopSongs,
  createUser,
  createSession,
  createSessionFromPlay,
  createAggSession,
  createSong,
  createMonth,
  createMonthSong,
  updateUser,
  updateUserLastUpdated,
  updatePlay,
  updateSession,
  updateAggSession,
  updateMonth,
  deleteSession,
  setArtist,
  setUserArtist,
  setPlay,
  setByRef,
  updateByRef,
  doBatch,
  transaction,
};

import {firestore} from "firebase-admin";
import {getEndTime} from "./helpers";
import {Session, Track} from "./types";
const db = firestore();

function getUser(userId: string) {
  return db.collection("User").doc(userId).get();
}

function getUsers() {
  return db.collection("User").get();
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

async function getNextSession(userId: string, lastSession: firestore.DocumentSnapshot<Session>) {
  return db.collection("User").doc(userId).collection("Sessions")
      .orderBy("end_time", "desc")
      .startAfter(lastSession)
      .limit(1)
      .get();
}

async function getNextPlay(userId: string, lastPlay: firestore.DocumentSnapshot<Track>) {
  return (await db.collection("User").doc(userId).collection("Plays")
      .orderBy("played_at", "asc")
      .startAfter(lastPlay)
      .limit(1)
      .get() as firestore.QuerySnapshot<Track>)?.docs[0];
}

async function getFirstPlay(userId: string) {
  return (await db.collection("User").doc(userId).collection("Plays")
      .orderBy("played_at", "asc")
      .limit(1)
      .get() as firestore.QuerySnapshot<Track>)?.docs[0];
}

async function getSessionsInInterval(startTime: string, endTime: string) {
  return db.collectionGroup("Sessions").where("start_time", ">=", startTime).where("start_time", "<", endTime).get() as Promise<firestore.QuerySnapshot<Session>>;
}

function createUser(userId: string) {
  return db.collection("User").doc(userId).set({
    created_date: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  }, {merge: true});
}

function createSession(userId: string, payload: Record<string, any>) {
  return db.collection("User").doc(userId).collection("Sessions").add(payload) as Promise<firestore.DocumentReference<Session>>;
}

function createSessionFromPLay(userId: string, play: firestore.QueryDocumentSnapshot<Track>) {
  return createSession(userId, {
    start_time: play.data().played_at,
    end_time: new Date(getEndTime(play.data())).toISOString(),
    play_references: firestore.FieldValue.arrayUnion(play.ref),
    latest_play: play.ref,
    duration_ms: play.data().track.duration_ms,
  });
}

function createAggSession(month: string, day: string, timestamps: Record<string, number>) {
  return db.collection("Aggregated").doc("NumSessions").collection(month).doc(day).set(timestamps);
}

function updateUser(userId: string, payload: Record<string, any>) {
  return db.collection("User").doc(userId).update(payload);
}

function updatePlay(userId: string, playId: string, payload: Record<string, any>) {
  return db.collection("User").doc(userId).collection("Plays").doc(playId).update(payload);
}

function updateSession(userId: string, sessionId: string, payload: firestore.UpdateData) {
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

function deleteSession(userId: string, sessionId: string) {
  return db.collection("User").doc(userId).collection("Sessions").doc(sessionId).delete();
}

async function doBatch(cb: (batch: firestore.WriteBatch, db: firestore.Firestore) => Promise<void>) {
  const batch = db.batch();
  await cb(batch, db);
  return batch.commit();
}

export const queries = {
  getUser,
  getUsers,
  getSecret,
  getSession,
  getSessions,
  getNextSession,
  getLatestSession,
  getNextPlay,
  getFirstPlay,
  getSessionsInInterval,
  createUser,
  createSession,
  createSessionFromPLay,
  createAggSession,
  updateUser,
  updateUserLastUpdated,
  updatePlay,
  updateSession,
  updateAggSession,
  deleteSession,
  doBatch,
};

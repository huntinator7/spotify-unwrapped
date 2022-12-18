import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Session, Track, User} from "./types";

const db = firestore();

export const calculateSessions = async (user: User) => {
  console.log("calculateSessions: " + user.id);
  // start_time
  // end_time
  // latest_play reference
  // play_references[]
  // duration_ms

  // get session with latest end_time
  const latestSessionRes = await db.collection("User").doc(user.id).collection("Sessions").orderBy("end_time", "desc").limit(1).get();
  // if session returned
  //    get latest play in session (might be get all plays referenced)
  const latestSession = latestSessionRes.empty ? await (await initializeSessions(user)).get() : latestSessionRes.docs[0] as firestore.DocumentSnapshot<Session>;

  assignPlayToSession(latestSession);
  // func (session)
  async function assignPlayToSession(session: firestore.DocumentSnapshot<Session>, lastPlayParam?: firestore.QueryDocumentSnapshot<Track>) {
    const lastPlay = lastPlayParam ?? await ((session.get("latest_play") as firestore.DocumentReference).get()) as firestore.DocumentSnapshot<Track>;
    // get the last play not analyzed (sort played_at asc, after last play reference)
    const nextPlay = (await db.collection("User").doc(user.id).collection("Plays")
        .orderBy("played_at", "asc")
        .startAfter(lastPlay)
        .limit(1)
        .get() as firestore.QuerySnapshot<Track>)?.docs[0];

    if (!nextPlay || !lastPlay) return;
    // compare play start time to session end time
    const timeBetweenPlays: number = getStartTime(nextPlay.data()) - getEndTime(lastPlay.data());
    // if within threshold,
    if (timeBetweenPlays < 1000 * 60 * 5) {
      // same session
      //  add session reference to play
      await db.collection("User").doc(user.id).collection("Plays").doc(nextPlay.id).update({
        session: session.ref,
      });
      //  add play reference to session play references
      //  update session end_time (temp, don't push maybe)
      await db.collection("User").doc(user.id).collection("Sessions").doc(session.id).update({
        play_references: FieldValue.arrayUnion(nextPlay.ref),
        latest_play: nextPlay.ref,
        end_time: new Date(getEndTime(nextPlay.data())).toISOString(),
        duration_ms: FieldValue.increment(nextPlay.data().track.duration_ms),
      });
      assignPlayToSession(session, nextPlay);
      //  call func again with same session
    } else {
      // else
      //    create new session
      const newSession = await db.collection("User").doc(user.id).collection("Sessions").add({
        start_time: nextPlay.data().played_at,
        end_time: new Date(getEndTime(nextPlay.data())).toISOString(),
        play_references: FieldValue.arrayUnion(nextPlay.ref),
        latest_play: nextPlay.ref,
        duration_ms: nextPlay.data().track.duration_ms,
      }) as firestore.DocumentReference<Session>;
      //    add session reference to play
      await db.collection("User").doc(user.id).collection("Plays").doc(nextPlay.id).update({
        session: newSession,
      });
      assignPlayToSession(await newSession.get(), nextPlay);
    }
  }
};

const initializeSessions = async (user: User) => {
  console.log("initializeSessions" + user.id);
  const firstPlay = (await db.collection("User").doc(user.id).collection("Plays")
      .orderBy("played_at", "asc")
      .limit(1)
      .get() as firestore.QuerySnapshot<Track>)?.docs[0];

  const newSession = await db.collection("User").doc(user.id).collection("Sessions").add({
    start_time: firstPlay.data().played_at,
    end_time: new Date(getEndTime(firstPlay.data())).toISOString(),
    play_references: FieldValue.arrayUnion(firstPlay.ref),
    latest_play: firstPlay.ref,
    duration_ms: firstPlay.data().track.duration_ms,
  }) as firestore.DocumentReference<Session>;
  //    add session reference to play
  await db.collection("User").doc(user.id).collection("Plays").doc(firstPlay.id).update({
    session: newSession,
  });
  return newSession;
};

const getEndTime = (track: Track | undefined): number => {
  return track ?
    new Date(new Date(track.played_at).valueOf() + track.track.duration_ms).valueOf() :
    0;
};

const getStartTime = (track: Track): number => {
  return new Date(track.played_at).valueOf();
};

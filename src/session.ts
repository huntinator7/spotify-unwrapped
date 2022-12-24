import {FieldValue, DocumentSnapshot, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {Session, Track, User} from "./types";
import {v4 as uuidv4} from "uuid";
import {queries} from "./queries";
import {getEndTime, getStartTime} from "./helpers";

export const calculateSessions = async (user: User) => {
  console.time("calculateSessions " + user.id);
  console.log("calculateSessions: " + user.id);

  const latestSessionRes = await queries.getLatestSession(user.id);

  const latestSession = latestSessionRes.empty ?
  await initializeSessions(user) :
  latestSessionRes.docs[0] as DocumentSnapshot<Session>;

  assignPlayToSession(latestSession);
  // func (session)
  async function assignPlayToSession(session: DocumentSnapshot<Session>, lastPlayParam?: QueryDocumentSnapshot<Track>) {
    const id = uuidv4();
    // console.log(`APTS: init, ${user.id}, ${session.id}, ${lastPlayParam?.id}`);
    const lastPlay = lastPlayParam ?? await ((session.get("latest_play")).get()) as DocumentSnapshot<Track>;
    // get the last play not analyzed (sort played_at asc, after last play reference)
    console.time("nextPlay " + id);
    const nextPlay = await queries.getNextPlay(user.id, lastPlay);
    console.timeEnd("nextPlay " + id);

    if (!nextPlay || !lastPlay) {
      console.timeEnd("calculateSessions " + user.id);
      return;
    }

    const timeBetweenPlays: number = getStartTime(nextPlay.data()) - getEndTime(lastPlay.data());
    if (timeBetweenPlays < 1000 * 60 * 5) {
      console.time("setSessionInPlay " + id);
      await queries.updatePlay(user.id, nextPlay.id, {session: session.ref});
      console.timeEnd("setSessionInPlay " + id);

      console.time("updateSession " + id);
      await queries.updateSession(user.id, session.id, {
        play_references: FieldValue.arrayUnion(nextPlay.ref),
        latest_play: nextPlay.ref,
        end_time: new Date(getEndTime(nextPlay.data())).toISOString(),
        duration_ms: FieldValue.increment(nextPlay.data().track.duration_ms),
      });
      console.timeEnd("updateSession " + id);

      assignPlayToSession(session, nextPlay);
    } else {
      console.time("createSession " + id);
      const newSession = await queries.createSessionFromPLay(user.id, nextPlay);
      console.timeEnd("createSession " + id);
      //    add session reference to play
      console.time("addSession " + id);
      await queries.updatePlay(user.id, nextPlay.id, {
        session: newSession,
      });
      console.timeEnd("addSession " + id);
      assignPlayToSession(await newSession.get(), nextPlay);
    }
  }
};

const initializeSessions = async (user: User) => {
  console.log("initializeSessions" + user.id);
  const firstPlay = await queries.getFirstPlay(user.id);
  const newSession = await queries.createSessionFromPLay(user.id, firstPlay);

  await queries.updatePlay(user.id, firstPlay.id, {
    session: newSession,
  });
  return newSession.get();
};

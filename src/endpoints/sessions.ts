import {FieldValue, DocumentSnapshot, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {Session, User, Play} from "../types";
import {v4 as uuidv4} from "uuid";
import {queries} from "../scripts/queries";
import {getEndTime, getStartTime} from "../scripts/helpers";

export const calculateSessions = async (user: User) => {
  console.time("calculateSessions " + user.id);
  console.log("calculateSessions: " + user.id);

  const latestSessionRes = await queries.getLatestSession(user.id);

  const latestSession = latestSessionRes.empty ?
  await initializeSessions(user) :
  latestSessionRes.docs[0] as DocumentSnapshot<Session>;

  assignPlayToSession(latestSession);
  // func (session)
  async function assignPlayToSession(session: DocumentSnapshot<Session>, lastPlayParam?: QueryDocumentSnapshot<Play>) {
    const id = uuidv4();
    // console.log(`APTS: init, ${user.id}, ${session.id}, ${lastPlayParam?.id}`);
    const lastPlay = lastPlayParam ?? await ((session.get("latest_play")).get()) as DocumentSnapshot<Play>;
    // get the last play not analyzed (sort played_at asc, after last play reference)
    console.time("nextPlay " + id);
    const nextPlay = await queries.getNextPlay(user.id, lastPlay);
    console.timeEnd("nextPlay " + id);

    if (!nextPlay || !lastPlay || !nextPlay?.exists || !lastPlay?.exists) {
      console.timeEnd("calculateSessions " + user.id);
      console.log(`doesn't exist', nextPlay ${nextPlay?.exists}, lastPlay ${lastPlay?.exists}`);
      return;
    }

    const timeBetweenPlays: number = getStartTime(nextPlay.data()) - getEndTime(lastPlay.data());
    if (timeBetweenPlays < 1000 * 60 * 15) {
      console.time("setSessionInPlay " + id);
      await queries.updatePlay(user.id, nextPlay.id, {session: session.ref});
      console.timeEnd("setSessionInPlay " + id);

      console.time("updateSession " + id);
      await queries.updateSession(user.id, session.id, {
        play_references: FieldValue.arrayUnion(nextPlay.ref),
        latest_play: nextPlay.ref,
        end_time: new Date(getEndTime(nextPlay.data())).toISOString(),
        duration_ms: FieldValue.increment(nextPlay.data().duration_ms),
      });
      console.timeEnd("updateSession " + id);

      assignPlayToSession(session, nextPlay);
    } else {
      console.time("createSession " + id);
      const newSession = await queries.createSessionFromPlay(user.id, nextPlay);
      console.timeEnd("createSession " + id);
      //    add session reference to play
      console.time("addSession " + id);
      console.log(newSession?.path);
      if (newSession) {
        await queries.updatePlay(user.id, nextPlay.id, {
          session: newSession,
        });
      } else {
        console.log("no new sessions?");
      }

      console.timeEnd("addSession " + id);
      assignPlayToSession(await newSession.get(), nextPlay);
    }
  }
};

const initializeSessions = async (user: User) => {
  console.log("initializeSessions" + user.id);
  const firstPlay = await queries.getFirstPlay(user.id);
  const newSession = await queries.createSessionFromPlay(user.id, firstPlay);

  await queries.updatePlay(user.id, firstPlay.id, {
    session: newSession,
  });
  return newSession.get();
};

export const initCombineSessions = async () => {
  const users = await queries.getUsers();
  users.forEach(async (u) => {
    const user = {...u.data(), id: u.id} as User;
    const latestSession = (await queries.getLatestSession(user.id)).docs[0] as DocumentSnapshot<Session>;
    const nextSession = (await queries.getNextSession(user.id, latestSession)).docs[0] as DocumentSnapshot<Session>;
    combineSessions(user, latestSession, nextSession);
  });
};

export const combineSessions = async (user: User, laterSession: DocumentSnapshot<Session>, earlierSession: DocumentSnapshot<Session>) => {
  console.log(`combineSessions, ${user.id}, ${laterSession?.id}, ${earlierSession?.id}`);
  if (!laterSession || !earlierSession) return;
  const ls = laterSession.data() as Session;
  const es = earlierSession.data() as Session;
  console.log(`comparing es ${es?.start_time} -- ${es?.end_time} to ls ${ls?.start_time} -- ${ls?.end_time}`);

  const timeBetween = new Date(ls.start_time).valueOf() - new Date(es.end_time).valueOf();
  if (timeBetween < 1000 * 60 * 15) {
    // combine sessions
    console.log(`tb ${timeBetween}, combining ${earlierSession.id} into ${laterSession.id}`);
    await queries.updateSession(user.id, laterSession.id, {
      start_time: es.start_time,
      duration_ms: es.duration_ms + ls.duration_ms,
      play_references: FieldValue.arrayUnion(...es.play_references),
    });
    await queries.deleteSession(user.id, earlierSession.id);
    const newEarlierSession = (await queries.getNextSession(user.id, earlierSession)).docs[0] as DocumentSnapshot<Session>;
    const newLaterSession = await queries.getSession(user.id, laterSession.id) as DocumentSnapshot<Session>;
    combineSessions(user, newLaterSession, newEarlierSession);
  } else {
    console.log(`tb ${timeBetween}, not combining ${earlierSession.id} into ${laterSession.id}`);
    const newEarlierSession = (await queries.getNextSession(user.id, earlierSession)).docs[0] as DocumentSnapshot<Session>;
    combineSessions(user, earlierSession, newEarlierSession);
  }
};

export function repopulatePlaySessions(start = "2022-12-07", index = 0, limit = 10) {
  // TODO: add sessions back in as references to listens before 1/3/2023
  console.log(start, index, limit);
}

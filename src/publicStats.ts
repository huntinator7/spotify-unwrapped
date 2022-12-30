import {addXDays, getDay, getMonth, getTimestamp, getXMinLater} from "./helpers";
import {queries} from "./queries";
import {firestore} from "firebase-admin";
import {Session} from "./types";

export function initAggregatedSessions(initDate: string) {
  console.log("initAggregatedSessions");
  // create new session at 0:00
  const day = new Date(new Date(initDate).setHours(0, 0, 0, 0));
  createDay(day, 0);
}

async function createDay(day: Date, i: number) {
  const today = addXDays(day, i);
  if (today > new Date()) return;
  const sessions = await queries.getSessionsInInterval(today.toISOString(), getXMinLater(today, 1440).toISOString());
  // await createAggSession(addXDays(day, i));
  let timestamps: Record<string, number> = {};
  Array.from({length: 96}, (_v, j) => {
    timestamps = {...timestamps, ...getTimestampForInterval(j, today, sessions)};
  });
  console.log(`timestamps, ${Object.values(timestamps).reduce((a, c) => a + c, 0)} total listens on ${today}`);
  await queries.createAggSession(getMonth(today), getDay(today), timestamps);
  createDay(day, i+1);
}

function getTimestampForInterval(index: number, day: Date, sessions: firestore.QuerySnapshot<Session>) {
  const newDate = new Date(index * 1000 * 60 * 15 + day.valueOf());
  if (newDate > new Date()) return {};

  const timestamp = getTimestamp(newDate);
  const intervalStart = newDate.toISOString();
  const intervalEnd = getXMinLater(newDate, 15).toISOString();
  const sessionsTotal = sessions.docs.filter((d) => (d.data().start_time <= intervalEnd && d.data().end_time > intervalStart));
  const numSessionsAtTimestamp = sessionsTotal.length;
  return {[timestamp]: numSessionsAtTimestamp};
}

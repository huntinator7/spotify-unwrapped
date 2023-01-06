import * as functions from "firebase-functions";
import {Play, PlayResult, Song} from "../types";
import {queries} from "./queries";

export function getEndTime(play: Play | undefined): number {
  return play ?
      new Date(new Date(play.played_at).valueOf() + play.duration_ms).valueOf() :
      0;
}

export function getStartTime(play: Play): number {
  return new Date(play.played_at).valueOf();
}

export function getTimestamp(date: Date): string {
  return `${numTo2Digit(date.getHours())}:${numTo2Digit(date.getMinutes())}`;
}

export function numTo2Digit(n: number): string {
  return n.toLocaleString("en-US", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
}

export function addDay(d: Date): Date {
  return addXDays(d, 1);
}

export function addXDays(d: Date, x: number): Date {
  return new Date(d.valueOf() + 1000 * 60 * 60 * 24 * x);
}

export function getMonth(d: Date): string {
  return (d.getMonth() + 1).toString();
}

export function getDay(d: Date): string {
  return `${getMonth(d)}-${d.getDate()}`;
}

export function getXMinLater(d: Date, x: number): Date {
  return new Date(d.valueOf() + 1000 * 60 * x);
}

export function trackToPlay(playRes: PlayResult): Play {
  const p = playRes.track;
  return {
    id: p.id,
    name: p.name,
    artists: p.artists.map(({id, name}) => ({id, name})),
    album: {
      name: p.album.name,
      id: p.album.id,
      image: p.album.images[2].url,
    },
    played_at: playRes.played_at,
    duration_ms: p.duration_ms,
    popularity: p.popularity,
    context: playRes.context,
    session: playRes.session,
  };
}

export function cleanTrack(playRes: PlayResult): {song: Song, play: Play} {
  const cleanedTrack = playRes.track;
  cleanedTrack.available_markets = ["US"];
  cleanedTrack.album.available_markets = ["US"];

  const play = trackToPlay(playRes);

  return {
    song: cleanedTrack,
    play,
  };
}

export function createTestFunction(name: string, func: (req: functions.https.Request) => any) {
  return functions.https.onRequest(async (req, res) => {
    const key: string = await queries.getSecret(name);
    console.log(key, req.query.key, key === req.query.key);
    if (req.query.key !== key) {
      res.status(401).send("Not authorized: Incorrect key provided");
    } else {
      try {
        res.status(200).send("Success");
        return func(req);
      } catch (e) {
        console.log("Error: " + JSON.stringify(e));
        res.status(500).send("Error: " + JSON.stringify(e));
      }
    }
  });
}

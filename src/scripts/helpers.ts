import {onCall} from "firebase-functions/v2/https";
import SpotifyWebApi from "spotify-web-api-node";
import {spotifyConfig} from "../config";
import {Play, PlayResult, Song, User} from "../types";
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
  return (numTo2Digit(d.getMonth() + 1)).toString();
}

export function getDay(d: Date): string {
  return `${getMonth(d)}-${numTo2Digit(d.getDate())}`;
}

export function getXMinLater(d: Date, x: number): Date {
  return new Date(d.valueOf() + 1000 * 60 * x);
}

export function getDays(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function getDateOfMonth(date: string) {
  return new Date(date).getDate();
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

export function cleanTrack(playRes: PlayResult, userId: string): {song: Song, play: Play} {
  const cleanedTrack = playRes.track;
  cleanedTrack.available_markets = ["US"];
  cleanedTrack.album.available_markets = ["US"];

  const play = trackToPlay(playRes);

  return {
    song: {
      ...cleanedTrack,
      uid: userId,
      listens: [],
      listen_count: 0,
    },
    play,
  };
}

export function createTestFunction(name: string, func: (data: any) => any) {
  return onCall(async (request) => {
    console.log("here in " + name);
    const key: string = await queries.getSecret(name);
    if (request.data.key !== key) {
      throw new Error("Key did not match");
    } else {
      func(request.data);
      console.log("here");
      return {result: "probably a success"};
    }
  });
}

export const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function getSpotifyApi(user: User): Promise<SpotifyWebApi> {
  const spotifyApi = new SpotifyWebApi(spotifyConfig());
  spotifyApi.setRefreshToken(user.refresh_token);
  const accessTokenRes = await spotifyApi.refreshAccessToken();
  spotifyApi.setAccessToken(accessTokenRes.body.access_token);

  return spotifyApi;
}

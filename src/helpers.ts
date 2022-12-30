import {Track} from "./types";

export function getEndTime(track: Track | undefined): number {
  return track ?
      new Date(new Date(track.played_at).valueOf() + track.track.duration_ms).valueOf() :
      0;
}

export function getStartTime(track: Track): number {
  return new Date(track.played_at).valueOf();
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

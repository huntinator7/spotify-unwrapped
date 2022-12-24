import {Track} from "./types";

export const getEndTime = (track: Track | undefined): number => {
  return track ?
      new Date(new Date(track.played_at).valueOf() + track.track.duration_ms).valueOf() :
      0;
};

export const getStartTime = (track: Track): number => {
  return new Date(track.played_at).valueOf();
};


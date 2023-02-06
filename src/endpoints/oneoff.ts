import {queries} from "../scripts/queries";
import {Artist} from "../types";

export async function populateArtists() {
  console.time("getPlays");
  const plays = await queries.getAllPlays();
  console.timeEnd("getPlays");

  console.time("keyedPlays");
  const keyedPlays = plays.docs.reduce((a, c) => {
    const artistsObj = c.data().artists?.map((artist) => ([
      artist.id,
      {
        ...artist,
        listens: [
          ...(a[artist.id]?.listens ?? []),
          c.ref,
        ],
        listen_count: (a[artist.id]?.listen_count ?? 0) + 1,
      },
    ])) ?? [];
    return {
      ...a,
      ...Object.fromEntries(artistsObj),
    };
  }, {} as Record<string, Artist>);
  console.timeEnd("keyedPlays");

  const keyedPlaysEntries = Object.entries(keyedPlays);
  console.log(keyedPlaysEntries.length);
  const [artistId, artist] = keyedPlaysEntries[0];
  console.log(artistId, artist);
  return Promise.all(keyedPlaysEntries.map(async ([artistId, artist]) => await queries.setArtist(artistId, artist)));
}

export async function populatUserArtists() {
  console.time("getPlays");
  const plays = await queries.getAllPlays();
  console.timeEnd("getPlays");
  console.time("getUsers");
  const users = await queries.getUsers();
  console.timeEnd("getUsers");

  console.time("keyedPlays");
  const keyedPlays = plays.docs.reduce((a, c) => {
    const artistsObj = c.data().artists?.map((artist) => ([
      artist.id,
      {
        ...artist,
        listens: [
          ...(a[artist.id]?.listens ?? []),
          c.ref,
        ],
        listen_count: (a[artist.id]?.listen_count ?? 0) + 1,
      },
    ])) ?? [];
    return {
      ...a,
      ...Object.fromEntries(artistsObj),
    };
  }, {} as Record<string, Artist>);
  console.timeEnd("keyedPlays");

  const keyedPlaysEntries = Object.entries(keyedPlays);
  console.log(keyedPlaysEntries.length);

  return Promise.all(users.docs.map((user) => {
    const userPath = `User/${user.id}`;
    return keyedPlaysEntries
        .filter(([_artistId, artists]) => artists.listens.some((l) => l.path.startsWith(userPath)))
        .map(([artistId, artist]) => {
          const listens = artist.listens.filter((l) => l.path.startsWith(userPath));
          const listen_count = listens.length;
          return queries.setUserArtist(user.id, artistId, {...artist, listens, listen_count, uid: user.id});
        });
  }).flat());
}

export async function addSongsToArtist() {
  // TODO: this
}

export async function addSongsToAlbum() {
  // TODO: this
}

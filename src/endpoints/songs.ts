import {QueryDocumentSnapshot, DocumentReference} from "firebase-admin/firestore";
import {queries} from "../scripts/queries";
import {Album, Play, Song} from "../types";

export async function populateUserSongs() {
  console.log("populateUserSongs");
  console.time("getUsers");
  const users = (await queries.getUsers()).docs;
  console.timeEnd("getUsers");
  console.log(users.length);
  const usersRes = await Promise.all(users.map(async (user) => {
    console.time("getPlaysur " + user.id);
    const plays = await queries.getPlays(user.id);
    console.timeEnd("getPlaysur " + user.id);
    console.log("plays length " + plays.docs?.length);

    const plays_duration = plays.docs.map((play) => Number.parseInt(play.data().duration_ms as any) || 0).reduce((a, c) => a + c, 0);

    console.log("plays duration " + user.id + " " + plays_duration);
    const userUpdate = {
      total_listen_time_ms: plays_duration,
      total_plays: plays.docs.length,
    };
    await queries.updateUser(user.id, userUpdate);
    return;
  }));

  return usersRes;
}

export async function populateSongAlbumListens() {
  // get plays
  const plays = (await queries.getAllPlays()).docs;
  console.log(`plays ${plays.length}`);
  const keyedPlaysSongs = plays.reduce<Record<string, QueryDocumentSnapshot<Play>[]>>((a, c) => {
    const id: string = c.data()?.id ?? "no-id";
    return {
      ...a,
      [id]: id in a ? [...a[id], c] : [c],
    };
  }, {});
  console.log(`keyedPlays ${Object.keys(keyedPlaysSongs).length} no-id ${keyedPlaysSongs["no-id"]}`);
  const keyedPlaysAlbums = plays.reduce<Record<string, QueryDocumentSnapshot<Play>[]>>((a, c) => {
    const id: string = c.data().album?.id ?? "no-id";
    return {
      ...a,
      [id]: id in a ? [...a[id], c] : [c],
    };
  }, {});
  console.log(`keyedPlaysAlbums ${Object.keys(keyedPlaysAlbums).length} no-id ${keyedPlaysAlbums["no-id"]}`);

  // songs
  // const songs = (await queries.getSongs()).docs.sort((a, b) => a.id > b.id ? -1 : 1);
  // console.log(`songs ${songs.length}`);
  // const songsWithListens = addListens(songs, keyedPlaysSongs);
  // console.log(`songsWithListens ${songsWithListens.length}`);
  // await updateWithListens(songsWithListens);

  // albums
  // const albums = (await queries.getAlbums()).docs.sort((a, b) => a.id > b.id ? -1 : 1);
  // console.log(`albums ${albums.length}`);
  // const albumsWithListens = addListens(albums, keyedPlaysAlbums);
  // console.log(`albumsWithListens ${albumsWithListens.length}`);
  // await updateWithListens(albumsWithListens);

  // user
  const users = (await queries.getUsers()).docs;
  console.log(`users ${users.length}`);

  // user songs
  const userSongsWithListens = (await Promise.all(users.map(async (user) => {
    const userSongs = await queries.getUserSongs(user.id);
    console.log(`userSongs ${user.id} ${userSongs.docs.length}`);
    return addListensUser(userSongs.docs, keyedPlaysSongs, user.id);
  }))).flat();
  console.log(`userSongsWithListens ${userSongsWithListens.length}`);
  await updateWithListens(userSongsWithListens);

  // user albums
  const allUserAlbums = (await queries.getAllUserAlbums()).docs;
  console.log(`allUserAlbums ${allUserAlbums.length}`);
  const userAlbumsWithListens = (await Promise.all(users.map(async (user) => {
    const userAlbums = await queries.getUserAlbums(user.id);
    console.log(`userAlbums ${user.id} ${userAlbums.docs.length}`);
    return addListensUser(userAlbums.docs, keyedPlaysAlbums, user.id);
  }))).flat();
  console.log(`userAlbumsWithListens ${userAlbumsWithListens.length}`);
  await updateWithListens(userAlbumsWithListens);

  return 1;
}

async function updateWithListens(items: {
  ref: DocumentReference,
  update: any,
}[]) {
  return await Promise.all(items.map(async (item) => {
    await queries.updateByRef(item.ref, item.update);
  }));
}

// function addListens(items: QueryDocumentSnapshot<Song | Album>[], plays: Record<string, QueryDocumentSnapshot<Play>[]>) {
//   return items.map((item) => {
//     const songPlays = plays[item.data().id] ?? [];
//     return {
//       ref: item.ref,
//       update: {
//         listens: songPlays.map((sp) => sp.ref),
//         listen_count: songPlays.length,
//       },
//     };
//   });
// }

function addListensUser(items: QueryDocumentSnapshot<Song | Album>[], plays: Record<string, QueryDocumentSnapshot<Play>[]>, userId: string) {
  return items.map((item) => {
    const songPlays = (plays[item.data().id] ?? []).filter((p) => p.ref.path.startsWith(`User/${userId}`));
    return {
      ref: item.ref,
      update: {
        listens: songPlays.map((sp) => sp.ref),
        listen_count: songPlays.length,
      },
    };
  });
}

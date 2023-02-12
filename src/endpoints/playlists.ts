import {queries} from "./../scripts/queries";
import {Month, User, Play, Song, Album, Artist, ListenInfo} from "../types";
import {getDateOfMonth, getDays, monthNames, numTo2Digit, getSpotifyApi} from "../scripts/helpers";
import {DocumentReference, QueryDocumentSnapshot, QuerySnapshot, FieldValue} from "firebase-admin/firestore";

export async function generateAllMonthlyStats(month: number) {
  const users = await queries.getUsers();
  return Promise.all(users.docs.map((user) => generateUserMonthlyStats({...user.data(), id: user.id}, month)));
}

export async function generateUserMonthlyStats(user: User, month: number) {
  // get all plays in that month
  const plays = await queries.getPlaysForMonth(user.id, month);
  console.log("plays for " + user.id, plays.docs.length, plays.docs[0]?.id);
  if (!plays.docs || plays.docs.length === 0) {
    console.log("no plays, no unwrapped");
    return {[user.id]: "no plays"};
  }
  if (!user.refresh_token) {
    console.log("no token, no unwrapped");
    return {[user.id]: "no token"};
  }
  if (user.available_months?.find((a) => a.id === month)) {
    console.log("already generated");
    return {[user.id]: "no token"};
  }

  const total_listen_time_ms = plays.docs.map((play) => play.data().duration_ms).reduce((a, c) => a + c, 0);

  const [mostListenedSong, playsKeyedBySong] = await getMostListened<Song>(plays, (c) => c.data().id, "", queries.getSong);
  const [mostListenedAlbum, playsKeyedByAlbum]= await getMostListened<Album>(plays, (c) => c.data().album?.id, "No Album", queries.getAlbum);
  const [mostListenedArtist, playsKeyedByArtist] = await getMostListened<Artist>(plays, (c) => c.data().artists?.[0]?.id, "No Artist", queries.getArtist);

  const spotifyApi = await getSpotifyApi(user);
  const mostListenedArtistFull = await spotifyApi.getArtist(mostListenedArtist.id);

  const days = getDays(2023, month);
  const minutes = total_listen_time_ms / (1000 * 60);

  type Day = string & { day: true };
  type Milliseconds = number & { ms: true };
  const dayKeyed = plays.docs.reduce<Record<Day, Milliseconds>>((a, c) => {
    const key = getDateOfMonth(c.data().played_at).toString() as Day;
    return {
      ...a,
      [key]: (a[key] ?? 0) + c.data().duration_ms,
    };
  }, {});
  const mostListenedDay = Object.entries(dayKeyed).sort(([_k1, v1], [_k2, v2]) => v2 - v1)[0];

  const payload: Month = {
    id: month,
    total_listen_time_ms,
    total_plays: plays.docs.length,
    total_songs: playsKeyedBySong.length,
    total_albums: playsKeyedByAlbum.length,
    total_artists: playsKeyedByArtist.length,
    avg_minutes_per_day: Math.ceil(minutes/days),
    most_listened_song: mostListenedSong,
    most_listened_album: mostListenedAlbum,
    most_listened_artist: {...mostListenedArtist, ...mostListenedArtistFull.body},
    most_listened_day: {
      day: mostListenedDay[0],
      listen_time_ms: mostListenedDay[1],
    },
  };

  await queries.createMonth(user.id, payload);

  const fiftyMostListenedSongs: Song[] = await Promise.all(
      playsKeyedBySong.filter(([id]) => !!id).slice(0, 50).map(async ([id, listens]) => {
        const song = await queries.getSong(id);
        return {
          ...song.data(),
          listens: listens,
          listen_count: listens.length,
          uid: user.id,
        };
      })
  );

  await Promise.all(fiftyMostListenedSongs.map((song) => queries.createMonthSong(user.id, month, song)));

  await queries.updateUser(user.id, {
    available_months: FieldValue.arrayUnion({
      collection: numTo2Digit(month),
      id: month,
      month: month - 1,
      month_name: monthNames[month - 1],
    }),
  });

  return {[user.id]: payload};
}

async function getMostListened<T extends ListenInfo>(
    plays: QuerySnapshot<Play>,
    accessor: (c: QueryDocumentSnapshot) => string,
    defaultId: string,
    query: (id: string) => Promise<QueryDocumentSnapshot<T>>
): Promise<[T, [string, DocumentReference<Play>[]][]]> {
  const playsKeyed = plays.docs.reduce((a, c) => ({...a, [accessor(c) ?? defaultId]: [...(a[accessor(c) ?? defaultId] ?? []), c.ref]}), {} as Record<string, DocumentReference<Play>[]>);
  const playsKeyedSorted = Object.entries(playsKeyed).sort(([_k1, v1], [_k2, v2]) => v2.length - v1.length);
  const mostListened = await query(playsKeyedSorted[0][0]);
  const mostListenedWithListenData = {
    ...mostListened.data(),
    listens: playsKeyedSorted[0][1],
    listen_count: playsKeyedSorted[0][1].length,
  };
  return [mostListenedWithListenData, playsKeyedSorted];
}

type CreateTopSongsPlaylist = {
  status: "error" | "success";
  message: string;
}
export async function createTopSongsPlaylist(userId: string, monthId: string): Promise<CreateTopSongsPlaylist> {
  const month = await queries.getMonth(userId, monthId);
  const monthName = monthNames[month.data().id - 1];
  if (month.data().playlist_id) {
    return {
      status: "error",
      message: "Playlist has already been created",
    };
  }

  const userDoc = await queries.getUser(userId);
  const user = {...userDoc.data(), id: userDoc.id} as User;

  const spotifyApi = await getSpotifyApi(user);

  const newPlaylist = await spotifyApi.createPlaylist(`Unwrapped ${monthName} 2023`, {
    description: `Your top 50 songs from ${monthName}`,
    public: false,
  });
  if (newPlaylist.statusCode === 201) {
    const playlistId = newPlaylist.body.id;

    const topSongs = await queries.getTopSongs(userId, monthId);
    const tracks: string[] = topSongs.docs.map((song) => song.data().uri);

    const addTracksRes = await spotifyApi.addTracksToPlaylist(playlistId, tracks);
    if (addTracksRes.statusCode === 201) {
      await queries.updateMonth(userId, monthId, {playlist_id: playlistId});
      return {
        status: "success",
        message: "Successfully created playlist. Check your Spotify!",
      };
    } else {
      return {
        status: "error",
        message: "Playlist created, but could not add tracks",
      };
    }
  } else {
    return {
      status: "error",
      message: "Playlist creation failed",
    };
  }
}

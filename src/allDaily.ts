import {initializeApp} from "firebase/app";
import {addDoc, collection, DocumentData, getDocs, getFirestore, QueryDocumentSnapshot} from "firebase/firestore";
import {firebaseConfig, spotifyConfig} from "./config";
import SpotifyWebApi from "spotify-web-api-node";
import {User} from "./types";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const spotifyApi = new SpotifyWebApi(spotifyConfig);

export const getAllDailyListens = async () => {
  const users = await getDocs(collection(db, "Users"));
  getUserDailyListens(users.docs, 0);
};

const getUserDailyListens = async (users: QueryDocumentSnapshot<DocumentData>[], i: number) => {
  if (i >= users.length) return;
  const user: User = users[i].data() as User;
  spotifyApi.setRefreshToken(user.refresh_token);

  const accessToken = await spotifyApi.refreshAccessToken();
  spotifyApi.setAccessToken(accessToken.body["access_token"]);

  await getAllRecentlyPlayedByDayUser(user, []);
  setTimeout(() => getUserDailyListens(users, i + 1), 1000);
};

const getAllRecentlyPlayedByDayUser = async (user: User, recentTracks: SpotifyApi.PlayHistoryObject[]) => {
  const mostRecent = await spotifyApi.getMyRecentlyPlayedTracks({limit: 10, after: parseInt(user.last_cursor)});
  const newRecentTracks = [...recentTracks, ...mostRecent.body.items.map((t) => cleanTrack(t))];
  if (mostRecent.body?.items?.length === 10) {
    getAllRecentlyPlayedByDayUser({...user, last_cursor: mostRecent.body.cursors.after}, newRecentTracks);
  } else {
    newRecentTracks.forEach((track) => sendTrackToDB(track, user.user_id));
  }
};

const cleanTrack = (track: SpotifyApi.PlayHistoryObject): SpotifyApi.PlayHistoryObject => {
  const cleanedTrack = track;
  cleanedTrack.track.available_markets = ["US"];
  cleanedTrack.track.album.available_markets = ["US"];

  return cleanedTrack;
};

const sendTrackToDB = (track: SpotifyApi.PlayHistoryObject, userId: string) => {
  addDoc(collection(db, "User", userId, "Plays"), track);
};

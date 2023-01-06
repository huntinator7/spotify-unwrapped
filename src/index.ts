import * as functions from "firebase-functions";
import {firestore} from "firebase-admin";
import {getApps, initializeApp} from "firebase-admin/app";
if (!getApps().length) {
  initializeApp();
  firestore().settings({
    ignoreUndefinedProperties: true,
  });
}

import {getRecentListens, initializeSpotify, shrinkPlays} from "./endpoints/plays";
import {createUser} from "./endpoints/user";
import {initCombineSessions} from "./endpoints/sessions";
import {initAggregatedSessions} from "./endpoints/publicStats";
import {populateUserSongs} from "./endpoints/songs";

import {User} from "./types";
import {queries} from "./scripts/queries";
import {createTestFunction} from "./scripts/helpers";

exports.getListens = functions
    .pubsub.schedule("0,15,30,45 * * * *")
    .timeZone("America/Denver")
    .onRun(getRecentListens);

exports.createUser = functions.auth.user().onCreate(createUser);

exports.initializeSpotify = functions.firestore.document("/User/{uid}")
    .onUpdate(async (change, context) => {
      const token = change.after.data().auth_code;
      const oldToken = change.before.data().auth_code;
      console.log(token, oldToken);
      if (token && !oldToken) {
        console.log("updating");
        const userDoc = await queries.getUser(context.params.uid);
        const user = {...userDoc.data(), id: userDoc.id} as User;
        initializeSpotify(user);
      }
    });

exports.getNewAggregatedSessions = functions
    .pubsub.schedule("1 0 * * *")
    .timeZone("America/Denver")
    .onRun(() => {
      initAggregatedSessions(new Date(new Date().setHours(new Date().getHours() - 24)).toISOString());
    });

exports.getListensManual = createTestFunction("listensManualKey", () => getRecentListens());

exports.combineSessionsManual = createTestFunction("combineSessionsManual", () => initCombineSessions());

exports.initAggregatedSessions = createTestFunction("initAggregatedSessions", (req) => initAggregatedSessions(req.query.date as string));

exports.shrinkPlaysTest = createTestFunction("shrinkPlaysTest", (req) => shrinkPlays(req.query.start as string || undefined, 0, Number.parseInt(req.query.limit as string, 10) || undefined));

exports.populateUserSongsTest = functions.https.onCall(async (data, context) => {
  const key: string = await queries.getSecret("populateUserSongsTest");
  if (data.key !== key) {
    return {error: "bad key"};
  } else {
    return populateUserSongs();
  }
});

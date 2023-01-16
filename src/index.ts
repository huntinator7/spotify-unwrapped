import * as functions from "firebase-functions/v1";
import {onMessagePublished} from "firebase-functions/v2/pubsub";
import {firestore} from "firebase-admin";
import {getApps, initializeApp} from "firebase-admin/app";
if (!getApps().length) {
  initializeApp();
  firestore().settings({
    ignoreUndefinedProperties: true,
  });
}

import {
  getRecentListens,
  initializeSpotify,
} from "./endpoints/plays";
import {createUser} from "./endpoints/user";
import {initCombineSessions} from "./endpoints/sessions";
import {initAggregatedSessions} from "./endpoints/publicStats";

import {User} from "./types";
import {queries} from "./scripts/queries";
import {createTestFunction} from "./scripts/helpers";
import {populatUserArtists} from "./endpoints/oneoff";

exports.getListens = functions
    .pubsub.schedule("0,15,30,45 * * * *")
    .timeZone("America/Denver")
    .onRun(async () => {
      console.time("getListensPubSub");
      const x = await getRecentListens();
      console.timeEnd("getListensPubSub");
      console.log("x:", x);
      return x;
    });

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

exports["getlistensmanual"] = createTestFunction("listensManualKey", () => getRecentListens());

exports["combinesessionsmanual"] = createTestFunction("combineSessionsManual", () => initCombineSessions());

exports["initaggregatedsessions"] = createTestFunction("initAggregatedSessions", (data) => initAggregatedSessions(data.date as string));

exports["populateartists"] = onMessagePublished("populateartists", () => populatUserArtists());

import * as functions from "firebase-functions";
import {getApps, initializeApp} from "firebase-admin/app";
if (!getApps().length) {
  initializeApp();
}

import {getRecentListens, initializeSpotify} from "./spotify";
import {createUser} from "./user";
import {User} from "./types";
import {queries} from "./queries";
import {initCombineSessions} from "./session";
import {initAggregatedSessions} from "./publicStats";


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

exports.getListensManual = functions.https.onRequest(async (req, res) => {
  const key: string = await queries.getSecret("listensManualKey");
  console.log(key, req.query.key, key === req.query.key);
  if (req.query.key !== key) {
    res.status(401).send("Not authorized: Incorrect key provided");
  } else {
    try {
      await getRecentListens();
      res.status(200).send("Success");
    } catch (e) {
      console.log("Error: " + JSON.stringify(e));
      res.status(500).send("Error: " + JSON.stringify(e));
    }
  }
});

exports.combineSessionsManual = functions.https.onRequest(async (req, res) => {
  const key: string = await queries.getSecret("combineSessionsManual");
  console.log(key, req.query.key, key === req.query.key);
  if (req.query.key !== key) {
    res.status(401).send("Not authorized: Incorrect key provided");
  } else {
    try {
      await initCombineSessions();
      res.status(200).send("Success");
    } catch (e) {
      console.log("Error: " + JSON.stringify(e));
      res.status(500).send("Error: " + JSON.stringify(e));
    }
  }
});

exports.initAggregatedSessions = functions.https.onRequest(async (req, res) => {
  const key: string = await queries.getSecret("initAggregatedSessions");
  console.log(key, req.query.key, key === req.query.key);
  if (req.query.key !== key) {
    res.status(401).send("Not authorized: Incorrect key provided");
  } else {
    try {
      initAggregatedSessions(req.query.date as string);
      res.status(200).send("Success");
    } catch (e) {
      console.log("Error: " + JSON.stringify(e));
      res.status(500).send("Error: " + JSON.stringify(e));
    }
  }
});

import * as functions from "firebase-functions";
import {firestore} from "firebase-admin";
import {getApps, initializeApp} from "firebase-admin/app";
if (!getApps().length) {
  initializeApp();
}
const db = firestore();

import {getRecentListens, initializeSpotify} from "./spotify";
import {createUser} from "./user";
import {User} from "./types";


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
        const userDoc = (await db.collection("User").doc(context.params.uid).get());
        const user = {...userDoc.data(), id: userDoc.id} as User;
        initializeSpotify(user);
      }
    });

exports.getListensManual = functions.https.onRequest(async (req, res) => {
  const key: string = (await db.collection("Secrets").doc("root").get()).get("listensManualKey");
  console.log(key, req.query.key, key === req.query.key);
  if (req.query.key !== key) {
    res.status(401).send("Not authorized: Incorrect key provided");
  } else {
    try {
      await getRecentListens();
      res.status(200).send("Success");
    } catch (e) {
      res.status(500).send("Error getting listens: " + JSON.stringify(e));
    }
  }
});

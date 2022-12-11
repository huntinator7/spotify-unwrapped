import {UserRecord} from "firebase-functions/v1/auth";
import * as admin from "firebase-admin";

export const createUser = async (user: UserRecord) => {
  await admin.firestore().collection("User").doc(user.uid).set({
    created_date: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  }, {merge: true});
};

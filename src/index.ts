import {getAllDailyListens} from "./allDaily";
import * as functions from "firebase-functions";

// // Start writing functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.getListensForDay = functions
    .pubsub.schedule("0 0/2 * * *")
    .timeZone("America/Denver")
    .onRun(getAllDailyListens);

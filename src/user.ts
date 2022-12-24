import {UserRecord} from "firebase-functions/v1/auth";
import {queries} from "./queries";

export const createUser = async (user: UserRecord) => {
  await queries.createUser(user.uid);
};

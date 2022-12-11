import fetch, {
  Headers,
} from "node-fetch";
import {spotifyConfig} from "./config";
import {AccessTokenResponse} from "./types";

export const getAccessToken = async (auth_code: string, code_verifier: string) => {
  const myHeaders = new Headers();
  myHeaders.append("Authorization", "Basic " + Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString("base64"));
  myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

  const urlencoded = new URLSearchParams();
  urlencoded.append("grant_type", "authorization_code");
  urlencoded.append("code", auth_code);
  urlencoded.append("redirect_uri", spotifyConfig.redirectUri);
  urlencoded.append("client_id", spotifyConfig.clientId);
  urlencoded.append("code_verifier", code_verifier);

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow" as RequestRedirect,
  };

  const response = await fetch("https://accounts.spotify.com/api/token", requestOptions);
  return response.json() as Promise<AccessTokenResponse>;
};

export const refreshAccessToken = async (refresh_token: string) => {
  const myHeaders = new Headers();
  myHeaders.append("Authorization", "Basic " + Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString("base64"));
  myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

  const urlencoded = new URLSearchParams();
  urlencoded.append("grant_type", "refresh_token");
  urlencoded.append("refresh_token", refresh_token);
  urlencoded.append("client_id", spotifyConfig.clientId);

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow" as RequestRedirect,
  };

  const response = await fetch("https://accounts.spotify.com/api/token", requestOptions);
  return response.json() as Promise<AccessTokenResponse>;
};

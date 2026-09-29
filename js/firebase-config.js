// Firebase web app config.
//
// Replace these placeholders with the real values from the Firebase console:
//   Project settings (gear icon) -> General -> "Your apps" -> your web app -> SDK setup and configuration -> Config.
// These values are not secrets: they identify the project to the client. Access is controlled by
// database.rules.json (and, for now, by the room ID acting as a shared secret).
const firebaseConfig = {
  apiKey: "AIzaSyB2BCEplAgy2iaAmKVSqdjHLK8kNFB4lb4",
  authDomain: "tokengame-e1bff.firebaseapp.com",
  databaseURL: "https://tokengame-e1bff-default-rtdb.firebaseio.com",
  projectId: "tokengame-e1bff",
  storageBucket: "tokengame-e1bff.firebasestorage.app",
  messagingSenderId: "426225531433",
  appId: "1:426225531433:web:83de029574113196a3fa38"
};

// Room used when the page URL has no ?room= parameter.
export const DEFAULT_ROOM = "main";

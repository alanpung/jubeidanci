import { client } from "../lib/db";

async function addIndex() {
  console.log("Adding index to session table...");
  try {
    await client`CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);`;
    console.log("Index added successfully!");
  } catch (err) {
    console.error("Error adding index:", err);
  } finally {
    await client.end();
  }
}

addIndex();

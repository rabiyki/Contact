// db.js
import { MongoClient } from "mongodb";

let client;
let db;

export async function getDB() {
  if (db) return db;
  client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  db = client.db("gsync");
  await db.collection("users").createIndex({ phone: 1 }, { unique: true });
  return db;
}

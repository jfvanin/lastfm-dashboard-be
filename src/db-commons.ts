import { Db, MongoClient } from 'mongodb';

export const loadDB = async (): Promise<MongoClient> => {
  const mongoClient = new MongoClient(String(process.env.MONGODB_URI), { auth: { username: process.env.MONGODB_USER, password: process.env.MONGODB_PASSWORD } });
  const clientPromise = mongoClient.connect();
  return clientPromise;
}

export const getDatabase = async (client: MongoClient): Promise<Db> => {
  const database = client.db(process.env.MONGODB_DATABASE);
  return database;
}
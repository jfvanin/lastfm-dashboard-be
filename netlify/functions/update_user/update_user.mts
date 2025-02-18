import 'dotenv/config'
import { Context } from '@netlify/functions'
import { corsHeaders } from '../../../src/commons';
import { getDatabase, loadDB } from '../../../src/db-commons';

const mongoClient = loadDB();

export default async (request: Request, context: Context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'multipart/form-data',
      },
      status: 200,
    });
  };
  try {
    const formData = await request.formData();
    const user = formData.get('user');
    const years = formData.get('years');
    const discoguser = formData.get('discogUser');
    const clearDiscogUser = formData.get('clearDiscogUser');
    if (!user) {
      throw new Error('User data not defined');
    }

    const updates = {
      ...(discoguser && { discoguser }),
      ...(clearDiscogUser && { discoguser: null }),
      ...(years && { years: years }),
    }

    const database = await getDatabase(await mongoClient);
    const collection = database.collection('user');
    const result = await collection.updateOne(
      { name: user },
      { $set: updates },
      { upsert: true }
    );

    if (result.modifiedCount === 0 && result.upsertedCount === 0) {
      throw new Error('Failed to update user');
    }

    return new Response(`User Updated`, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...corsHeaders
      },
      status: 200,
    });
  } catch (error) {
    console.log(error);
    return new Response(error.toString(), {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...corsHeaders
      },
      status: 500,
    });
  }
}

import 'dotenv/config'
import { Context } from '@netlify/functions'
import { corsHeaders } from '../../../src/commons';
import { getDatabase, loadDB } from '../../../src/db-commons';

const mongoClient = loadDB();

export default async (request: Request, context: Context) => {
  try {
    const url = new URL(request.url)
    const user = url.searchParams.get('user');
    if (!user) {
      throw new Error('User param not defined');
    }

    const database = await getDatabase(await mongoClient);
    const collection = database.collection('user');
    const result = await collection.findOne({ name: user });

    return new Response(result ? JSON.stringify(result) : 'User not found', {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(error.toString(), {
      status: 500,
    });
  }
}

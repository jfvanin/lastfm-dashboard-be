import 'dotenv/config'
import { Context } from '@netlify/functions'
import { corsHeaders } from '../../../src/commons';
import { getDatabase, loadDB } from '../../../src/db-commons';

const mongoClient = loadDB();

export default async (request: Request, context: Context) => {
  try {
    const user = context.url.searchParams.get('user');
    const year = context.url.searchParams.get('year');
    if (!user) {
      throw new Error('User param not defined');
    }

    const database = await getDatabase(await mongoClient);
    const collection = database.collection('scrobbles');

    const startDate = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000;
    const endDate = new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000;
    const pipeline = [
      {
        $match: {
          user: user,
          ...(year && {
            $expr: {
              $and: [
                { $gte: [{ $toLong: "$date.uts" }, startDate] },
                { $lt: [{ $toLong: "$date.uts" }, endDate] }
              ]
            }
          })
        }
      },
      {
        $unwind: "$artistTags"
      },
      {
        $group: {
          _id: "$artistTags",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 12
      }
    ];

    const result = await collection.aggregate(pipeline).toArray();
    console.log(result);
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(error.toString(), {
      status: 500,
    })
  }
}

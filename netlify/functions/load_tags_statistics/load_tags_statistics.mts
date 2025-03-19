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
    const endDate = year ? new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000 : null;
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
      ...(year ? [
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
      ] : [
        {
          $group: {
            _id: { $year: { $toDate: { $multiply: [{ $toLong: "$date.uts" }, 1000] } } },
            tags: { $push: "$artistTags" },
            totalScrobbles: { $sum: 1 }
          }
        },
        {
          $unwind: "$tags"
        },
        {
          $unwind: "$tags"
        },
        {
          $group: {
            _id: { year: "$_id", tag: "$tags" },
            count: { $sum: 1 },
            totalScrobbles: { $first: "$totalScrobbles" }
          }
        },
        {
          $sort: { "_id.year": 1, count: -1 }
        },
        {
          $group: {
            _id: "$_id.year",
            tags: {
              $push: {
                tag: "$_id.tag",
                count: "$count",
                percentage: { $multiply: [{ $divide: ["$count", "$totalScrobbles"] }, 100] }
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            tags: { $slice: ["$tags", 10] }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ])
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

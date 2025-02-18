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
          albumYear: { $ne: "Unknown" },
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
        $addFields: {
          decade: {
            $concat: [
              { $substr: [{ $subtract: [{ $toInt: "$albumYear" }, { $mod: [{ $toInt: "$albumYear" }, 10] }] }, 0, 3] },
              "0s"
            ]
          },
          year: {
            $dateToString: { format: "%Y", date: { $toDate: { $multiply: [{ $toLong: "$date.uts" }, 1000] } } }
          }
        }
      },
      ...(year ? [
        {
          $group: {
            _id: "$decade",
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ] : [
        {
          $group: {
            _id: { year: "$year", decade: "$decade" },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.year": 1, "_id.decade": 1 }
        },
        {
          $group: {
            _id: "$_id.year",
            total: { $sum: "$count" },
            decades: {
              $push: {
                decade: "$_id.decade",
                count: "$count"
              }
            }
          }
        },
        {
          $unwind: "$decades"
        },
        {
          $addFields: {
            "decades.percentage": {
              $multiply: [
                { $divide: ["$decades.count", "$total"] },
                100
              ]
            }
          }
        },
        {
          $group: {
            _id: "$_id",
            total: { $first: "$total" },
            decades: { $push: "$decades" }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ])
    ];

    const result = await collection.aggregate(pipeline).toArray();
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

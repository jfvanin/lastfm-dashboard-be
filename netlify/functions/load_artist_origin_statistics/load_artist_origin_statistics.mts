import 'dotenv/config'
import { Context } from '@netlify/functions'
import { corsHeaders } from '../../../src/commons';
import { getDatabase, loadDB } from '../../../src/db-commons';

const mongoClient = loadDB();

export default async (request: Request, context: Context) => {
  try {
    const user = context.url.searchParams.get('user');
    const year = context.url.searchParams.get('year');
    const limit = context.url.searchParams.get('limit');
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
          artistCountry: { $ne: "Unknown" },
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
          year: {
            $dateToString: { format: "%Y", date: { $toDate: { $multiply: [{ $toLong: "$date.uts" }, 1000] } } }
          }
        }
      },
      ...(year ? [
        {
          $group: {
            _id: "$artistCountry",
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: limit ? limit : 6,
        }
      ] : [
        {
          $group: {
            _id: { year: "$year", artistCountry: "$artistCountry" },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.year": 1, "_id.artistCountry": 1 }
        },
        {
          $group: {
            _id: "$_id.year",
            total: { $sum: "$count" },
            countries: {
              $push: {
                artistCountry: "$_id.artistCountry",
                count: "$count"
              }
            }
          }
        },
        {
          $unwind: "$countries"
        },
        {
          $addFields: {
            "countries.percentage": {
              $multiply: [
                { $divide: ["$countries.count", "$total"] },
                100
              ]
            }
          }
        },
        {
          $group: {
            _id: "$_id",
            total: { $first: "$total" },
            countries: { $push: "$countries" }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ])
    ];

    const result = await collection.aggregate(pipeline).toArray();

    if (result.length && !year) {
      result.forEach((year) => {
        year.countries.sort((a, b) => b.count - a.count);
        const others = year.countries.slice(6);
        year.countries = year.countries.slice(0, 6);
        if (others.length) {
          year.countries.push({
            artistCountry: 'Others',
            count: others.reduce((acc, cur) => acc + cur.count, 0),
            percentage: others.reduce((acc, cur) => acc + cur.percentage, 0)
          });
        }
      });
    }
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

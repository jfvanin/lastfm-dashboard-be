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
    if (!year) {
      throw new Error('Year param not defined');
    }

    const database = await getDatabase(await mongoClient);
    const collection = database.collection('scrobbles');

    const startDate = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000;
    const endDate = new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000;
    let pipeline = [
      {
        $match: {
          'user': user,
          'date.uts': { $gte: startDate.toString(), $lte: endDate.toString() }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: { $toDate: { $multiply: [{ $toLong: '$date.uts' }, 1000] } } },
            month: { $month: { $toDate: { $multiply: [{ $toLong: '$date.uts' }, 1000] } } },
            day: { $dayOfMonth: { $toDate: { $multiply: [{ $toLong: '$date.uts' }, 1000] } } },
            artist: '$artist'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      }
    ];
    const resultTop5ScrobbleDays = await collection.aggregate(pipeline).toArray();

    const pipeline2 = [
      {
        $match: {
          'user': user,
          'date.uts': { $gte: startDate.toString(), $lte: endDate.toString() }
        }
      },
      {
        $group: {
          _id: '$artist',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      },
      {
        $project: {
          artist: '$_id',
          count: 1,
          _id: 0
        }
      }
    ];
    const resultTop5MostScrobbleArtists = await collection.aggregate(pipeline2).toArray();

    const pipeline3 = [
      {
        $match: {
          'user': user,
          'date.uts': { $gte: startDate.toString(), $lte: endDate.toString() },
          'album.#text': { $ne: '' }  // Exclude empty album names
        }
      },
      {
        $group: {
          _id: '$album',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      },
      {
        $project: {
          album: '$_id',
          count: 1,
          _id: 0
        }
      }
    ];
    const resultTop5MostScrobbleAlbums = await collection.aggregate(pipeline3).toArray();

    const pipeline4 = [
      {
        $match: {
          'user': user,
          'date.uts': { $gte: startDate.toString(), $lte: endDate.toString() }
        }
      },
      {
        $group: {
          _id: '$name',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      },
      {
        $project: {
          name: '$_id',
          count: 1,
          _id: 0
        }
      }
    ];
    const resultTop5MostScrobbleTracks = await collection.aggregate(pipeline4).toArray();

    const pipeline5 = [
      {
        $match: {
          user: user,
          'date.uts': { $gte: startDate.toString(), $lte: endDate.toString() }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: { $toDate: { $multiply: [{ $toLong: '$date.uts' }, 1000] } } },
            month: { $month: { $toDate: { $multiply: [{ $toLong: '$date.uts' }, 1000] } } },
            day: { $dayOfMonth: { $toDate: { $multiply: [{ $toLong: '$date.uts' }, 1000] } } }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ];

    const scrobbles = await collection.aggregate(pipeline5).toArray();

    const streaks: number[][] = [];
    let currentStreak: number[] = [];
    let top5Streaks: { from: string, to: string, count: number }[] = [];

    if (scrobbles.length) {
      for (let i = 0; i < scrobbles.length; i++) {
        const currentDate = new Date(scrobbles[i]._id.year, scrobbles[i]._id.month - 1, scrobbles[i]._id.day).getTime() / 1000;
        if (currentStreak.length === 0) {
          currentStreak.push(currentDate);
        } else {
          const lastDate = currentStreak[currentStreak.length - 1];
          if (currentDate - lastDate === 86400) {
            currentStreak.push(currentDate);
          } else {
            streaks.push(currentStreak);
            currentStreak = [currentDate];
          }
        }
      }
      if (currentStreak.length > 0) {
        streaks.push(currentStreak);
      }

      streaks.sort((a, b) => b.length - a.length);
      top5Streaks = streaks.slice(0, 5).map(streak => ({
        from: new Date(streak[0] * 1000).toISOString().split('T')[0],
        to: new Date(streak[streak.length - 1] * 1000).toISOString().split('T')[0],
        count: streak.length
      }));
    }

    const result = {
      top5ScrobbleDays: resultTop5ScrobbleDays,
      top5Streaks: top5Streaks,
      top5MostScrobbleArtists: resultTop5MostScrobbleArtists,
      top5MostScrobbleAlbums: resultTop5MostScrobbleAlbums,
      top5MostScrobbleTracks: resultTop5MostScrobbleTracks,
    };

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

import 'dotenv/config'
import { MongoError } from 'mongodb';
import { getDatabase, loadDB } from '../src/db-commons';

// Define interfaces for the data structure
interface Image {
  size: string;
  "#text": string;
}

interface Artist {
  mbid: string;
  "#text": string;
}

interface Album {
  mbid: string;
  "#text": string;
}

interface DateInfo {
  uts?: string;
  "#text": string;
}

interface Track {
  artist: Artist;
  streamable: string;
  image: Image[];
  mbid: string;
  album: Album;
  name: string;
  url: string;
  date: DateInfo;
}

const mongoClient = loadDB();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to transform the array
const transformArray = (arr: Track[]): { transformedData: Record<string, Record<string, Track[]>>, artists: string[], albums: string[] } => {
  const transformed: Record<string, Record<string, Track[]>> = {};
  const artistNames = new Set<string>();
  const albumKeys = new Set<string>();

  arr.forEach(item => {
    if (!item.date) {
      // Probably it is the currently playing track
      return;
    }
    const artistName = item.artist["#text"];
    const albumKey = item.album.mbid || "Undefined";
    // Collect artist names and album keys
    if (artistName) {
      artistNames.add(artistName);
    }
    if (item.album.mbid) {
      albumKeys.add(item.album.mbid);
    }

    // Ensure artist exists in transformed object
    if (!transformed[artistName]) {
      transformed[artistName] = {};
    }

    // Ensure album exists within the artist
    if (!transformed[artistName][albumKey]) {
      transformed[artistName][albumKey] = [];
    }

    // Add the track to the appropriate album
    transformed[artistName][albumKey].push(item);
  });

  // Sort tracks within each album by 'uts' date
  for (const artist in transformed) {
    for (const album in transformed[artist]) {
      transformed[artist][album].sort((a, b) => {
        if (!a.date?.uts) {
          return 1;
        } else if (!b.date?.uts) {
          return -1;
        }
        return parseInt(a.date.uts) - parseInt(b.date.uts);
      });
    }
  }

  return {
    transformedData: transformed,
    artists: Array.from(artistNames),
    albums: Array.from(albumKeys)
  };
};

const getArtistCountryAndTags = async (artists: string[]): Promise<{ artist: string, country: string, tags: string[] }[]> => {
  const processedList: { artist: string, country: string, tags: string[] }[] = [];
  const processedFromDbList: { artist: string, country: string, tags: string[] }[] = [];

  const database = await getDatabase(await mongoClient);
  const collection = database.collection('artist');

  const dbArtists = await collection.find({
    artist: { $in: artists }
  }).toArray();

  for (const artist of artists) {
    if (dbArtists.some(dbArtist => dbArtist.artist === artist)) {
      const dbArtist = dbArtists.find(dbArtist => dbArtist.artist === artist);
      processedFromDbList.push({
        artist,
        country: dbArtist?.country,
        tags: dbArtist?.tags,
      });
      continue;
    }

    const response = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artist)}&fmt=json`, {
      headers: {
        'User-Agent': 'LastFMDashboard/test/1.0.2 (jozeh5@gmail.com)'
      }
    });
    let readresponse = await response.text();
    let apiResult;
    try {
      apiResult = JSON.parse(readresponse);
    } catch (error) {
      console.log(readresponse);
      console.log('Request:', `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artist)}&fmt=json`);
      console.log('ERROR:', error);
      throw error;
    }
    const artistRetrieved = apiResult.artists[0] || null;
    let country = "Unknown";
    if (artistRetrieved?.area?.type === "Country") {
      country = artistRetrieved.area.name;
    } else if (artistRetrieved && artistRetrieved["begin-area"]?.type === "Country") {
      country = artistRetrieved["begin-area"].name;
    }
    processedList.push({
      artist,
      country,
      tags: artistRetrieved?.tags?.filter((tag: any) => tag.count >= 2).map((tag: any) => tag.name) || [],
    });
    // Delay for 1 second before making the next request
    await delay(1000);
  }

  if (processedList.length > 0) {
    try {
      await collection.insertMany(processedList,
        {
          ordered: false
        }
      );
    } catch (error) {
      console.log('ERROR:', error);
    }
  }
  console.log('Retrieved from api amount:', processedList.length);
  console.log('Retrieved from db amount:', processedFromDbList.length);

  return processedList.concat(processedFromDbList);
};

const getAlbumYear = async (albums: string[]): Promise<{ album: string, year?: number }[]> => {
  const processedList: { album: string, year?: number }[] = [];
  const processedFromDbList: { album: string, year?: number }[] = [];

  const database = await getDatabase(await mongoClient);
  const collection = database.collection('album');

  const dbAlbums = await collection.find({
    album: { $in: albums }
  }).toArray();

  // Couldn't do it on Promise.all due to the delay required by musicbrainz rate limit
  for (const album of albums) {
    if (dbAlbums.some(dbAlbum => dbAlbum.album === album)) {
      const dbAlbum = dbAlbums.find(dbAlbum => dbAlbum.album === album);
      processedFromDbList.push({
        album,
        year: dbAlbum?.year,
      });
      continue;
    }

    const response = await fetch(`https://musicbrainz.org/ws/2/release-group/?release=${album}&fmt=json`, {
      headers: {
        'User-Agent': 'LastFMDashboard/test/1.0.2 (jozeh5@gmail.com)'
      }
    });
    if (response.status === 404) {
      console.log('Album not found:', album);
      continue;
    }
    const apiResult = JSON.parse(await response.text());
    const albumRetrieved = apiResult["release-groups"][0] || null;
    if (albumRetrieved && (albumRetrieved["primary-type"] !== "Compilation" &&
      !albumRetrieved["secondary-types"].includes("Compilation"))) {
      processedList.push({
        album,
        year: parseInt(albumRetrieved["first-release-date"].split('-')[0]),
      });
    } else {
      processedList.push({
        album,
      });
    }

    // Delay for half second before making the next request
    await delay(1000);
  }

  if (processedList.length > 0) {
    try {
      await collection.insertMany(processedList,
        {
          ordered: false
        }
      );
    } catch (error) {
      console.log('ERROR:', error);
    }
  }

  console.log('Retrieved from api amount:', processedList.length);
  console.log('Retrieved from db amount:', processedFromDbList.length);

  return processedList.concat(processedFromDbList);
};


const loadFullData = async (user: string): Promise<number> => {
  try {
    if (!user) {
      throw new Error('User param not defined');
    }

    const database = await getDatabase(await mongoClient);
    const collection = database.collection('scrobbles');

    const latestTrack = await collection.findOne(
      { user: user }, // Replace with the specific user if needed
      { sort: { 'date.uts': 1 } } // Sort by date.uts in descending order
    );

    let latestTimestamp = '';
    if (latestTrack && latestTrack.date.uts) {
      latestTimestamp = '&to=' + (parseInt(latestTrack.date.uts) + 1);
    }

    console.log('Latest timestamp:', latestTimestamp);

    const response = await fetch(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=${process.env.LASTFM_API_KEY}&user=${user}${latestTimestamp}&limit=500&format=json`)
    const result = JSON.parse(await response.text());
    const tracks = { ...result.recenttracks };

    if (!tracks.track) {
      console.log('No tracks found, or error in the response from lastFM', tracks);
    }
    if (tracks.track.length) {

      // Transform the original array
      const transformedArray = transformArray(tracks.track);

      // Get artist country and tags
      console.log('Getting artist country and tags...');
      console.log('total req artists:', transformedArray.artists.length);
      const artistInfo = await getArtistCountryAndTags(transformedArray.artists);
      console.log('total req albums:', transformedArray.albums.length);
      const albumYears = await getAlbumYear(transformedArray.albums);

      // Create a map for quick lookup
      const artistInfoMap = new Map(artistInfo.map(info => [info.artist, info]));
      const albumYearMap = new Map(albumYears.map(info => [info.album, info.year]));
      const arrayToPersist: Track[] = [];

      // Update each track in the transformed array
      for (const artist in transformedArray.transformedData) {
        for (const album in transformedArray.transformedData[artist]) {
          transformedArray.transformedData[artist][album] = transformedArray.transformedData[artist][album].map(track => {
            const artistData = artistInfoMap.get(artist) || { country: 'Unknown', tags: [] };
            const albumYear = albumYearMap.get(album) || 'Unknown';
            const updatedTrack = {
              ...track,
              user: user,
              artistCountry: artistData.country,
              artistTags: artistData.tags,
              albumYear: albumYear
            };

            arrayToPersist.push(updatedTrack);

            return updatedTrack;
          });
        }
      }

      try {
        await collection.insertMany(arrayToPersist,
          {
            ordered: false
          }
        );
      } catch (error) {
        const mongoError = error as MongoError;
        if (mongoError.code === 11000) { // Duplicate key error E11000 duplicate key error collection
          console.log('Duplicate key error, moving on...');
        } else {
          console.log('Insert Many failed:', mongoError);
        }
      }
      //const result = await collection.deleteMany({});

      console.log('Finished');
      return arrayToPersist.length;
    } else {
      return 0;
    }
  } catch (error) {
    console.log(error);
  }
  return 0;
}

const handler = async (user: string) => {
  try {
    let latestResultAmount = 1;
    while (latestResultAmount > 0) {
      latestResultAmount = await loadFullData(user);
      console.log('Latest result amount:', latestResultAmount);
    }
  } finally {
    if (mongoClient) {
      await (await mongoClient).close();
    }
  }
}

handler('jfvanin'); //Specify LastFM User
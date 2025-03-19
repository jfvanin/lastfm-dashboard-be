import 'dotenv/config'
import { MongoError } from 'mongodb';
import { getDatabase, loadDB } from '../src/db-commons';
import { Track, AlbumInfo, ArtistInfo } from '../src/common-types';
import { getAlbumYear, getArtistCountryAndTags, transformArray } from '../netlify/functions/load_data/load_data.mts';

const mongoClient = loadDB();

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
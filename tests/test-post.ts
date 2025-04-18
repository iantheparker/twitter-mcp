import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TwitterClient } from '../src/twitter-api.js';
import { Config } from '../src/types.js';
import fs from 'fs';
import { expect } from 'chai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

// Create config
const twitterConfig: Config = {
  apiKey: process.env.API_KEY!,
  apiSecretKey: process.env.API_SECRET_KEY!,
  accessToken: process.env.ACCESS_TOKEN!,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
};

// Validate config
if (!twitterConfig.apiKey || !twitterConfig.apiSecretKey || !twitterConfig.accessToken || !twitterConfig.accessTokenSecret) {
  throw new Error('Missing environment variables');
}

describe('Twitter API Tests', () => {
  let client: TwitterClient;
  let base64Image: string;

  before(() => {
    // Create client
    client = new TwitterClient(twitterConfig);

    // Test parameters
    const imagePath = resolve(__dirname, 'test-image.png');

    // Verify the image file exists and is readable
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // Read the image file as binary and convert to base64
    const imageBuffer = readFileSync(imagePath);
    base64Image = imageBuffer.toString('base64');
  });

  describe('Tweet Posting', () => {
    it('should post a tweet with an image', async () => {
      const testMessage = "hello world with image!";
      
      const postedTweet = await client.postTweet(testMessage, {
        data: base64Image,
        mediaType: 'image/png'
      });

      expect(postedTweet).to.have.property('id');
      expect(postedTweet).to.have.property('text');
      expect(postedTweet.text).to.equal(testMessage);
    });

    it('should post a tweet without an image', async () => {
      const testMessage = "hello world without image!";
      
      const postedTweet = await client.postTweet(testMessage);

      expect(postedTweet).to.have.property('id');
      expect(postedTweet).to.have.property('text');
      expect(postedTweet.text).to.equal(testMessage);
    });
  });
});

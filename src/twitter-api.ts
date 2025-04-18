import { TwitterApi, ApiResponseError, EUploadMimeType, SendTweetV2Params } from 'twitter-api-v2';
import { Config, TwitterError, Tweet, TwitterUser, PostedTweet } from './types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Setup logging to a file in the user's home directory
const logDir = path.join(os.homedir(), '.twitter-mcp');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'twitter-mcp.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message: string) {
  const timestamp = new Date().toISOString();
  logStream.write(`${timestamp} ${message}\n`);
}

export class TwitterClient {
  private client: TwitterApi;

  constructor(config: Config) {
    this.client = new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecretKey,
      accessToken: config.accessToken,
      accessSecret: config.accessTokenSecret,
    });
    log('Twitter API client initialized');
  }

  async checkRateLimit(endpoint: string): Promise<void> {
    // Rate limit check is currently not working correctly with Twitter API v2
    // We'll rely on the API's built-in rate limiting for now
    return;
  }

  async postTweet(text: string, media?: { data: string, mediaType?: string }): Promise<PostedTweet> {
    try {
      const endpoint = 'tweets/create';
      await this.checkRateLimit(endpoint);

      let mediaId: string | undefined;

      if (media) {
        // Upload media using v1.1 API
        const mediaBuffer = Buffer.from(media.data, 'base64');
        mediaId = await this.client.v1.uploadMedia(mediaBuffer, { mimeType: 'image/png' });
        log(`Media uploaded with ID: ${mediaId}`);
      }
            
      // Post the tweet using v2 API
      const tweetParams: SendTweetV2Params = {
        text: text,
      };

      if (mediaId) {
        tweetParams.media = { media_ids: [mediaId] };
      }

      const response = await this.client.v2.tweet(tweetParams);
      const tweetId = response.data?.id;
      const tweetText = response.data?.text;

      log(`Tweet posted successfully with ID: ${tweetId}`);
      
      return {
        id: tweetId,
        text: tweetText
      };
    } catch (error) {
      log(`[ERROR] Twitter API Error in postTweet: ${error}`);
      this.handleApiError(error);
    }
  }

  async searchTweets(query: string, maxResults = 10): Promise<{ tweets: Tweet[], users: TwitterUser[] }> {
    try {
      const response = await this.client.v2.search(query, {
        max_results: maxResults,
        'tweet.fields': ['text', 'created_at', 'author_id', 'public_metrics'],
        'user.fields': ['username', 'name', 'verified'],
        'expansions': ['author_id']
      });

      log(`Fetched ${response.tweets.length} tweets for query: "${query}"`);

      const tweets = response.tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at ?? new Date().toISOString(),
        authorId: tweet.author_id ?? '',
        metrics: {
          likes: tweet.public_metrics?.like_count ?? 0,
          retweets: tweet.public_metrics?.retweet_count ?? 0
        }
      }));

      const users = response.includes?.users?.map(user => ({
        id: user.id,
        username: user.username
      })) ?? [];

      return { tweets, users };
    } catch (error) {
      log(`[ERROR] Twitter API Error in searchTweets: ${error}`);
      this.handleApiError(error);
    }
  }

  async getUserInfo(username: string): Promise<TwitterUser | undefined> {
    try {
      const response = await this.client.v2.userByUsername(username, {
        'user.fields': ['username']
      });

      if (!response.data) return undefined;

      return {
        id: response.data.id,
        username: response.data.username
      };
    } catch (error) {
      log(`[ERROR] Twitter API Error in getUserInfo: ${error}`);
      this.handleApiError(error);
    }
  }

  private handleApiError(error: unknown): never {
    if (error instanceof ApiResponseError) {
      throw new TwitterError(
        error.data?.error ?? error.message ?? 'Unknown Twitter API error',
        error.code?.toString() ?? 'unknown',
        error.response?.statusCode
      );
    }
    throw error;
  }
}
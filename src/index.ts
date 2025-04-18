#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  ErrorCode,
  McpError,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import { TwitterClient } from './twitter-api.js';
import { ResponseFormatter } from './formatter.js';
import {
  Config, ConfigSchema,
  PostTweetSchema, SearchTweetsSchema,
  TwitterError
} from './types.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import z from 'zod';

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

// Helper function to handle image file paths
function handleImageFile(filePath: string): { data: string, mediaType: string } {
  if (!fs.existsSync(filePath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `File not found: ${filePath}`
    );
  }

  // Get file extension and determine media type
  const ext = path.extname(filePath).toLowerCase();
  let mediaType: string;
  
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      mediaType = 'image/jpeg';
      break;
    case '.png':
      mediaType = 'image/png';
      break;
    case '.gif':
      mediaType = 'image/gif';
      break;
    case '.webp':
      mediaType = 'image/webp';
      break;
    default:
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unsupported image format: ${ext}. Supported formats: jpg, jpeg, png, gif, webp`
      );
  }

  // Read file and convert to base64
  const fileData = fs.readFileSync(filePath);
  const base64Data = fileData.toString('base64');

  return {
    data: base64Data,
    mediaType
  };
}

export class TwitterServer {
  private server: Server;
  private client: TwitterClient;

  constructor(config: Config) {
    // Validate config
    const result = ConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    this.client = new TwitterClient(config);
    this.server = new Server({
      name: 'twitter-mcp',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Error handler
    this.server.onerror = (error) => {
      log(`[MCP Error]: ${error}`);
    };

    // Graceful shutdown
    process.on('SIGINT', async () => {
      log('Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    // Register tool handlers
    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'post_tweet',
          description: 'Post a new tweet to Twitter with optional media attachments',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The content of your tweet',
                maxLength: 280
              },
              media: {
                type: 'array',
                description: 'Optional media attachments (max 4 images or 1 video)',
                items: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'string',
                      description: 'Base64 encoded media data or file path to an image'
                    },
                    mediaType: {
                      type: 'string',
                      description: 'MIME type of media (e.g., image/jpeg, video/mp4). Optional if data is a file path.'
                    }
                  },
                  required: ['data']
                },
                maxItems: 4
              }
            },
            required: ['text']
          }
        } as Tool,
        {
          name: 'post_tweet_with_image',
          description: 'Post a tweet with a single image file',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The content of your tweet',
                maxLength: 280
              },
              imagePath: {
                type: 'string',
                description: 'Path to the image file (jpg, jpeg, png, gif, webp)'
              }
            },
            required: ['text', 'imagePath']
          }
        } as Tool,
        {
          name: 'post_tweet_debug',
          description: 'Debug tool to log media information without posting to Twitter',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The content of your tweet',
                maxLength: 280
              },
              media: {
                type: 'array',
                description: 'Optional media attachments (max 4 images or 1 video)',
                items: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'string',
                      description: 'Base64 encoded media data'
                    },
                    mediaType: {
                      type: 'string',
                      description: 'MIME type of media (e.g., image/jpeg, video/mp4)'
                    }
                  },
                  required: ['data', 'mediaType']
                },
                maxItems: 4
              }
            },
            required: ['text']
          }
        } as Tool,
        {
          name: 'search_tweets',
          description: 'Search for tweets on Twitter',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              count: {
                type: 'number',
                description: 'Number of tweets to return (10-100)',
                minimum: 10,
                maximum: 100
              }
            },
            required: ['query', 'count']
          }
        } as Tool
      ]
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      log(`Tool called: ${name} ${JSON.stringify(args)}`);
      log(`[DEBUG] Received CallToolRequest: ${JSON.stringify(request, null, 2)}`);

      try {
        switch (name) {
          case 'post_tweet':
            log('[DEBUG] Routing to handlePostTweet...');
            return await this.handlePostTweet(args);
          case 'post_tweet_with_image':
            log('[DEBUG] Routing to handlePostTweetWithImage...');
            return await this.handlePostTweetWithImage(args);
          case 'post_tweet_debug':
            log('[DEBUG] Routing to handlePostTweetDebug...');
            return await this.handlePostTweetDebug(args);
          case 'search_tweets':
            log('[DEBUG] Routing to handleSearchTweets...');
            return await this.handleSearchTweets(args);
          default:
            log(`[ERROR] Unknown tool: ${name}`);
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        log(`[DEBUG] Error in CallToolRequest handler: ${error}`);
        return this.handleError(error);
      }
    });
  }

  private async handlePostTweetWithImage(args: unknown) {
    const schema = z.object({
      text: z.string(),
      imagePath: z.string()
    });

    const result = schema.safeParse(args);
    if (!result.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${result.error.message}`
      );
    }

    try {
      const { text, imagePath } = result.data;
      const media = handleImageFile(imagePath);
      
      const tweet = await this.client.postTweet(text, media);
      return {
        content: [{
          type: 'text',
          text: `Tweet posted successfully!\nURL: https://twitter.com/status/${tweet.id}`
        }] as TextContent[]
      };
    } catch (error) {
      log(`[ERROR] Error in post_tweet_with_image: ${error}`);
      throw error;
    }
  }

  private async handlePostTweet(args: unknown) {
    log(`[DEBUG] Inside handlePostTweet. Args: ${JSON.stringify(args, null, 2)}`);
    const result = PostTweetSchema.safeParse(args);
    if (!result.success) {
      log(`[ERROR] Invalid parameters for post_tweet: ${result.error.message}`);
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${result.error.message}`
      );
    }

    try {
      log(`[DEBUG] Calling this.client.postTweet with text: ${result.data.text}`);
      
      // Handle media if present
      let mediaToPost = undefined;
      if (result.data.media && result.data.media.length > 0) {
        const mediaItem = result.data.media[0];
        
        // Check if the data is a file path
        if (mediaItem.data.includes('/') || mediaItem.data.includes('\\')) {
          mediaToPost = handleImageFile(mediaItem.data);
        } else {
          // Use the provided data as is (assuming it's already base64)
          mediaToPost = mediaItem;
        }
      }
      
      const tweet = await this.client.postTweet(result.data.text, mediaToPost);
      log(`[DEBUG] postTweet successful. Result: ${JSON.stringify(tweet, null, 2)}`);
      return {
        content: [{
          type: 'text',
          text: `Tweet posted successfully!\nURL: https://twitter.com/status/${tweet.id}`
        }] as TextContent[]
      };
    } catch (error) {
      log(`[ERROR] Error calling this.client.postTweet: ${error}`);
      throw error;
    }
  }

  private async handlePostTweetDebug(args: unknown) {
    log(`[DEBUG] Inside handlePostTweetDebug. Args: ${JSON.stringify(args, null, 2)}`);
    const result = PostTweetSchema.safeParse(args);
    if (!result.success) {
      log(`[ERROR] Invalid parameters for post_tweet_debug: ${result.error.message}`);
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${result.error.message}`
      );
    }

    try {
      log(`[DEBUG] Debugging tweet text: ${result.data.text}`);
      
      let debugInfo = `Tweet text: "${result.data.text}"\n`;
      
      if (result.data.media && result.data.media.length > 0) {
        debugInfo += `\nMedia items: ${result.data.media.length}\n`;
        
        result.data.media.forEach((media, index) => {
          debugInfo += `\nMedia item #${index + 1}:\n`;
          debugInfo += `- Media type: ${media.mediaType}\n`;
          
          // Check if data is a file path
          const isFilePath = media.data.includes('/') || media.data.includes('\\');
          debugInfo += `- Looks like a file path: ${isFilePath}\n`;
          
          if (isFilePath) {
            debugInfo += `- File path: ${media.data}\n`;
            try {
              // Check if file exists
              const fileExists = fs.existsSync(media.data);
              debugInfo += `- File exists: ${fileExists}\n`;
              
              if (fileExists) {
                // Get file stats
                const stats = fs.statSync(media.data);
                debugInfo += `- File size: ${stats.size} bytes\n`;
                debugInfo += `- File type: ${path.extname(media.data)}\n`;
                
                // Try to read the file
                try {
                  const fileData = fs.readFileSync(media.data);
                  const base64Data = fileData.toString('base64');
                  debugInfo += `- Successfully read file and converted to base64\n`;
                  debugInfo += `- Base64 length: ${base64Data.length} characters\n`;
                } catch (readError) {
                  debugInfo += `- Error reading file: ${readError}\n`;
                }
              }
            } catch (fileError) {
              debugInfo += `- Error checking file: ${fileError}\n`;
            }
          } else {
            // Check if data is base64 encoded
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(media.data);
            debugInfo += `- Is base64 encoded: ${isBase64}\n`;
            
            // Check data length
            debugInfo += `- Data length: ${media.data.length} characters\n`;
            
            // Try to decode a small portion to see if it's valid base64
            if (isBase64) {
              try {
                const decodedLength = Buffer.from(media.data.substring(0, 100), 'base64').length;
                debugInfo += `- First 100 chars decode to ${decodedLength} bytes\n`;
              } catch (e) {
                debugInfo += `- Error decoding base64: ${e}\n`;
              }
            }
          }
        });
      } else {
        debugInfo += "\nNo media attached to this tweet.";
      }
      
      log(`[DEBUG] Debug info: ${debugInfo}`);
      
      return {
        content: [{
          type: 'text',
          text: `DEBUG INFO:\n${debugInfo}`
        }] as TextContent[]
      };
    } catch (error) {
      log(`[ERROR] Error in post_tweet_debug: ${error}`);
      throw error;
    }
  }

  private async handleSearchTweets(args: unknown) {
    const result = SearchTweetsSchema.safeParse(args);
    if (!result.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${result.error.message}`
      );
    }

    const { tweets, users } = await this.client.searchTweets(
      result.data.query,
      result.data.count
    );

    const formattedResponse = ResponseFormatter.formatSearchResponse(
      result.data.query,
      tweets,
      users
    );

    return {
      content: [{
        type: 'text',
        text: ResponseFormatter.toMcpResponse(formattedResponse)
      }] as TextContent[]
    };
  }

  private handleError(error: unknown) {
    if (error instanceof McpError) {
      throw error;
    }

    if (error instanceof TwitterError) {
      if (TwitterError.isRateLimit(error)) {
        return {
          content: [{
            type: 'text',
            text: 'Rate limit exceeded. Please wait a moment before trying again.',
            isError: true
          }] as TextContent[]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Twitter API error: ${(error as TwitterError).message}`,
          isError: true
        }] as TextContent[]
      };
    }

    log(`Unexpected error: ${error}`);
    throw new McpError(
      ErrorCode.InternalError,
      'An unexpected error occurred'
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log('Twitter MCP server running on stdio');
  }
}

// Start the server
dotenv.config();

const config = {
  apiKey: process.env.API_KEY!,
  apiSecretKey: process.env.API_SECRET_KEY!,
  accessToken: process.env.ACCESS_TOKEN!,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!
};

const server = new TwitterServer(config);
server.start().catch(error => {
  log(`Failed to start server: ${error}`);
  process.exit(1);
});
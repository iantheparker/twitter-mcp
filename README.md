# Twitter MCP Server

[![smithery badge](https://smithery.ai/badge/@enescinar/twitter-mcp)](https://smithery.ai/server/@enescinar/twitter-mcp)

This MCP server allows Clients to interact with Twitter, enabling posting tweets with media attachments and searching Twitter.

<a href="https://glama.ai/mcp/servers/dhsudtc7cd">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/dhsudtc7cd/badge" alt="Twitter Server MCP server" />
</a>

## Quick Start

1. Create a Twitter Developer account and get your API keys from [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)

2. Add this configuration to your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "twitter-mcp": {
      "command": "npx",
      "args": ["-y", "@enescinar/twitter-mcp"],
      "env": {
        "API_KEY": "your_api_key_here",
        "API_SECRET_KEY": "your_api_secret_key_here",
        "ACCESS_TOKEN": "your_access_token_here",
        "ACCESS_TOKEN_SECRET": "your_access_token_secret_here"
      }
    }
  }
}
```

3. Restart Claude Desktop

That's it! Claude can now interact with Twitter through two tools:

- `post_tweet`: Post a new tweet with optional media attachments (images or video)
- `search_tweets`: Search for tweets

## Example Usage

Try asking Claude:
- "Can you post a tweet saying 'Hello from Claude!'"
- "Can you search for tweets about Claude AI?"
- "Can you post a tweet with this image?" (when sharing an image)
- "Can you tweet these photos with a caption?" (when sharing multiple images)

### Media Support

The `post_tweet` tool supports attaching media to tweets:

- Up to 4 images per tweet
- Supported formats: JPEG, PNG, GIF, WebP
- Maximum file sizes:
  - Images: up to 5MB each
  - GIFs: up to 15MB
  - Videos: up to 512MB (MP4)

Example of posting a tweet with media:
```json
{
  "text": "Check out this photo!",
  "media": [{
    "data": "base64EncodedImageData",
    "mediaType": "image/jpeg"
  }]
}
```

Example of posting a tweet with multiple images:
```json
{
  "text": "Photo gallery!",
  "media": [
    {
      "data": "base64EncodedImageData1",
      "mediaType": "image/jpeg"
    },
    {
      "data": "base64EncodedImageData2",
      "mediaType": "image/png"
    }
  ]
}
```

## Troubleshooting

Logs can be found at:
- **Windows**: `%APPDATA%\Claude\logs\mcp-server-twitter.log`
- **macOS**: `~/Library/Logs/Claude/mcp-server-twitter.log`


## Development

If you want to contribute or run from source:

1. Clone the repository:
```bash
git clone https://github.com/EnesCinr/twitter-mcp.git
cd twitter-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build:
```bash
npm run build
```

4. Run:
```bash
npm start
```

## License

MIT
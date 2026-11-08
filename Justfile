port := "3000"

set dotenv-load

# Run the MCP server over stdio (default mode for Claude Desktop / MCP clients)
run:
    npm run start

# Run the MCP server over HTTP/SSE on the given port (default: 3000)
run-sse port=port:
    npm run start -- --sse --port {{port}}

# Run the MCP server over HTTP/SSE with write tools enabled
run-sse-write port=port:
    npm run start -- --sse --enable-write --port {{port}}

# Install dependencies from the lock file
install:
    npm ci

# Update all dependency lock files to the latest versions within package.json ranges
update-deps:
    npm install

# Update all dependencies to their latest available versions (beyond current semver range)
update-deps-latest:
    npm update --save

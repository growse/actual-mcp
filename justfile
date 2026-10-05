# Actual Budget MCP server tasks.
# Env vars (ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_BUDGET_SYNC_ID, ...) are read from .env by the server.

set dotenv-load

port := env("PORT", "3000")

# List available recipes
default:
    @just --list

# Install dependencies
install:
    npm ci

# Install dependencies if node_modules is missing or older than package-lock.json
[private]
deps:
    @[ node_modules/.package-lock.json -nt package-lock.json ] || npm ci

# Compile TypeScript to build/
build: deps
    npm run build

# Recompile on change
watch: deps
    npm run watch

# Run over stdio, read-only (from source)
run *args: deps
    npx tsx src/index.ts {{ args }}

# Run SSE / streamable HTTP server, read-only
sse *args: deps
    npx tsx src/index.ts --sse --port {{ port }} {{ args }}

# Run SSE / streamable HTTP server with write tools enabled
sse-write *args: deps
    npx tsx src/index.ts --sse --enable-write --port {{ port }} {{ args }}

# Run the compiled SSE server, read-only
sse-built *args: build
    node build/index.js --sse --port {{ port }} {{ args }}

# Run the compiled SSE server with write tools enabled
sse-write-built *args: build
    node build/index.js --sse --enable-write --port {{ port }} {{ args }}

# Open the MCP inspector against the compiled server
inspector: deps build
    npm run inspector

# Run unit tests
test: deps
    npm run test

# Run unit tests in watch mode
test-watch: deps
    npm run test:unit:watch

# Run unit tests with coverage
coverage: deps
    npm run test:coverage

# Run end-to-end tests (requires Docker)
e2e: deps build
    npm run test:e2e

# Lint
lint: deps
    npm run lint

# Format code
fmt: deps
    npm run format

# Type-check sources
type-check: deps
    npm run type-check

# Lint + format check + type-check
quality: deps
    npm run quality

# Everything CI runs
ci: install build quality coverage

# Build the Docker image
docker-build tag="actual-mcp:local":
    docker build -t {{ tag }} .

# Run the Docker image as a read-only SSE server
docker-sse tag="actual-mcp:local":
    docker run --rm -it --env-file .env -p {{ port }}:3000 {{ tag }} --sse

# Run the Docker image as an SSE server with write tools enabled
docker-sse-write tag="actual-mcp:local":
    docker run --rm -it --env-file .env -p {{ port }}:3000 {{ tag }} --sse --enable-write

# Remove build output
clean:
    rm -rf build coverage

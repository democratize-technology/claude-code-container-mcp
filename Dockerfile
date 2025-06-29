# Production stage
FROM node:20-slim

# Install Docker CLI and SSH client
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    openssh-client && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Run as non-root user
USER node

WORKDIR /app

# Copy package files
COPY package.json ./

# Install ALL dependencies (including dev)
RUN npm install

# Copy source files AND tsconfig
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript - this should create the dist folder
RUN npm run build

CMD ["npx", "-y", "claude-code-container-mcp"]

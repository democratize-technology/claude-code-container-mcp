# Claude Code Container MCP Server

An MCP (Model Context Protocol) server that manages containerized Claude Code sessions, allowing AI assistants to create and control isolated Claude Code instances. Supports both Anthropic API and AWS Bedrock.

## Features

- 🐳 **Docker-based Isolation**: Each Claude Code instance runs in its own container
- 🔄 **Session Management**: Create, execute, and destroy Claude Code sessions
- 📁 **Volume Mounting**: Persistent storage for project files
- 🔒 **Security**: Container isolation protects the host system
- 🚀 **Scalability**: Run multiple sessions simultaneously
- 🛠️ **Extended Tools**: File transfer, command execution, and log access
- ☁️ **AWS Bedrock Support**: Use Claude through AWS Bedrock for enterprise deployments
- 🔑 **Flexible Authentication**: Support for both Anthropic API keys and AWS credentials

## What's Different?

This is a fork of [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) that adds containerization capabilities. Instead of running Claude Code directly, this server manages Docker containers running Claude Code, providing:

- Better isolation between different projects
- Ability to run multiple Claude Code instances
- Protection of the host system
- Easy cleanup of resources
- Support for AWS Bedrock as an alternative to Anthropic API

## Prerequisites

- Node.js v20 or later
- Docker installed and running
- Access to `ghcr.io/Zeeno-atl/claude-code:latest` image
- Either:
  - Anthropic API key, OR
  - AWS credentials with Bedrock access

## Installation

### Using npm (recommended)

```bash
npm install -g @democratize-technology/claude-code-container-mcp
```

### Using Docker

```bash
docker pull ghcr.io/democratize-technology/claude-code-container-mcp:latest
```

## Configuration

### For Claude Desktop

#### Option 1: Using Anthropic API

```json
{
  "claude-code-container": {
    "command": "node",
    "args": ["/path/to/claude-code-mcp/dist/container-server.js"],
    "env": {
      "ANTHROPIC_API_KEY": "your-api-key"
    }
  }
}
```

#### Option 2: Using AWS Bedrock

```json
{
  "claude-code-container": {
    "command": "node",
    "args": ["/path/to/claude-code-mcp/dist/container-server.js"],
    "env": {
      "CLAUDE_CODE_USE_BEDROCK": "1",
      "AWS_REGION": "us-east-1",
      "AWS_ACCESS_KEY_ID": "your-access-key",
      "AWS_SECRET_ACCESS_KEY": "your-secret-key",
      "ANTHROPIC_MODEL": "us.anthropic.claude-opus-4-20250514-v1:0",
      "ANTHROPIC_SMALL_FAST_MODEL": "us.anthropic.claude-3-5-haiku-20241022-v1:0"
    }
  }
}
```

### For Other MCP Clients

See your client's documentation for MCP server configuration.

## Available Tools

### 1. `create_session`
Creates a new Claude Code container session.

**Arguments:**
- `projectPath` (string, required): Path to mount in the container
- `sessionName` (string, optional): Human-friendly session name
- `apiKey` (string, optional): Anthropic API key for this session
- `useBedrock` (boolean, optional): Use AWS Bedrock instead of Anthropic API
- `awsRegion` (string, optional): AWS region for Bedrock
- `awsAccessKeyId` (string, optional): AWS access key ID
- `awsSecretAccessKey` (string, optional): AWS secret access key
- `awsSessionToken` (string, optional): AWS session token (for temporary credentials)
- `bedrockModel` (string, optional): Bedrock model ID
- `bedrockSmallModel` (string, optional): Bedrock small/fast model ID

### 2. `execute_in_session`
Executes a Claude Code command in an existing session.

**Arguments:**
- `sessionId` (string, required): Session ID
- `prompt` (string, required): Prompt for Claude Code
- `tools` (array of strings, optional): Specific tools to enable

### 3. `list_sessions`
Lists all active sessions with their status.

### 4. `destroy_session`
Destroys a Claude Code session and removes the container.

**Arguments:**
- `sessionId` (string, required): Session ID to destroy

### 5. `transfer_files`
Transfers files between host and container.

**Arguments:**
- `sessionId` (string, required): Session ID
- `direction` (string, required): 'to_container' or 'from_container'
- `sourcePath` (string, required): Source path
- `destPath` (string, required): Destination path

### 6. `execute_command`
Executes an arbitrary command in the container.

**Arguments:**
- `sessionId` (string, required): Session ID
- `command` (string, required): Command to execute

### 7. `get_session_logs`
Retrieves container logs for debugging.

**Arguments:**
- `sessionId` (string, required): Session ID
- `tail` (number, optional): Number of lines to tail (default: 100)

## Usage Examples

### Creating a Session with Anthropic API
```
Create a new Claude Code session for the project at /home/user/my-project
```

### Creating a Session with AWS Bedrock
```
Create a new Claude Code session for /home/user/my-project using Bedrock with AWS region us-west-2
```

### Working with Code
```
In session abc123, refactor the main.py file to use async/await
```

### Managing Sessions
```
List all active sessions
Destroy session abc123
```

## AWS Bedrock Configuration

### Setting up AWS Credentials

The MCP server supports multiple ways to provide AWS credentials:

1. **Environment Variables** (Global default):
   ```bash
   export CLAUDE_CODE_USE_BEDROCK=1
   export AWS_REGION=us-east-1
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   ```

2. **Per-Session Credentials**:
   When creating a session, you can provide specific AWS credentials that will only be used for that session.

3. **IAM Roles** (if running on AWS):
   If the MCP server is running on an EC2 instance or ECS, it can use IAM roles.

### Required IAM Permissions

Your AWS credentials need the following Bedrock permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

### Model Access

Ensure you have requested and been granted access to Claude models in AWS Bedrock:
1. Go to AWS Console > Bedrock > Model access
2. Request access to Anthropic Claude models
3. Wait for approval (usually automatic for Claude models)

## Development

### Local Setup

```bash
# Clone the repository
git clone https://github.com/democratize-technology/claude-code-mcp.git
cd claude-code-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

### Using Docker Compose

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your API key or AWS credentials

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f mcp-server
```

## Environment Variables

### General
- `DEFAULT_CLAUDE_IMAGE`: Docker image to use (default: ghcr.io/zeeno-atl/claude-code:latest)
- `MCP_CLAUDE_DEBUG`: Enable debug logging (true/false)
- `DOCKER_HOST`: Docker daemon socket (default: unix:///var/run/docker.sock) (default: unix:///var/run/docker.sock)

### Custom Docker Image

The default base image has hardcoded `/app` paths. We provide a custom image that properly uses `/workspace`:

```bash
# Build the custom image
./build-custom-image.sh

# This creates: claude-code-workspace:latest
```

If you prefer the original image, set:
```bash
export DEFAULT_CLAUDE_IMAGE=ghcr.io/zeeno-atl/claude-code:latest
```

### Anthropic API
- `ANTHROPIC_API_KEY`: Your Anthropic API key

### AWS Bedrock
- `CLAUDE_CODE_USE_BEDROCK`: Set to "1" to use Bedrock by default
- `AWS_REGION`: AWS region where Bedrock is available
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_SESSION_TOKEN`: AWS session token (for temporary credentials)
- `ANTHROPIC_MODEL`: Bedrock model ID for primary model
- `ANTHROPIC_SMALL_FAST_MODEL`: Bedrock model ID for small/fast model

## Security Considerations

- This server requires access to the Docker daemon, which has security implications
- Each Claude Code instance runs in an isolated container
- Containers have limited access to the host system
- Always review the code Claude Code generates before executing
- Consider running the MCP server itself in a container for additional isolation
- When using AWS Bedrock, follow AWS security best practices for credential management

## Troubleshooting

### Container Creation Fails
- Ensure Docker is running: `docker ps`
- Check if the image is accessible: `docker pull ghcr.io/Zeeno-atl/claude-code:latest`
- Verify your user has Docker permissions

### Session Not Responding
- Check container logs: Use the `get_session_logs` tool
- Verify the container is running: Use `list_sessions`
- For Anthropic API: Ensure the API key is valid
- For AWS Bedrock: Check AWS credentials and model access

### AWS Bedrock Issues
- Verify AWS credentials: `aws sts get-caller-identity`
- Check Bedrock model access in AWS Console
- Ensure the AWS region supports Bedrock
- Check IAM permissions for Bedrock InvokeModel

### Permission Issues
- The container runs with your user ID to prevent permission problems
- Ensure the project path is accessible
- Check Docker socket permissions

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT

## Acknowledgments

- Original [claude-code-mcp](https://github.com/steipete/claude-code-mcp) by Peter Steinberger
- [Zeeno-atl/claude-code](https://github.com/Zeeno-atl/claude-code) for the containerized Claude Code image
- Anthropic for Claude and the Model Context Protocol
- AWS for Bedrock service

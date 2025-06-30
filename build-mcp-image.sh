#!/bin/bash
# Build the custom Claude Code image with MCP support

echo "Building claude-code-mcp:latest..."

# Ensure we're using the local Docker context
docker --context desktop-linux build \
  -f Dockerfile.mcp \
  -t claude-code-mcp:latest \
  .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "To use this image, set the following in your MCP server config:"
    echo '  "env": {'
    echo '    "DEFAULT_CLAUDE_IMAGE": "claude-code-mcp:latest"'
    echo '  }'
else
    echo "❌ Build failed"
    exit 1
fi

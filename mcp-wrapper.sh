#!/bin/sh
# MCP Config Processor
# This script runs at container startup to merge MCP_CONFIG into .claude.json

if [ -n "$MCP_CONFIG" ]; then
    echo "[MCP] Processing MCP configuration..."
    
    # Decode and merge MCP config
    echo "$MCP_CONFIG" | base64 -d > /tmp/mcp_config.json
    
    # Use Python to merge the configs
    python3 -c "
import json

# Read existing config
try:
    with open('/root/.claude.json', 'r') as f:
        config = json.load(f)
except:
    config = {'projects': {'/app': {'mcpServers': {}}}}

# Read MCP config
with open('/tmp/mcp_config.json', 'r') as f:
    mcp_config = json.load(f)

# Ensure structure exists
if 'projects' not in config:
    config['projects'] = {}
if '/app' not in config['projects']:
    config['projects']['/app'] = {}
if 'mcpServers' not in config['projects']['/app']:
    config['projects']['/app']['mcpServers'] = {}

# Merge MCP servers
config['projects']['/app']['mcpServers'] = mcp_config.get('mcpServers', {})

# Write back
with open('/root/.claude.json', 'w') as f:
    json.dump(config, f, indent=2)

print('[MCP] Configuration merged successfully')
"
    
    rm -f /tmp/mcp_config.json
fi

# Execute the original command
exec "$@"

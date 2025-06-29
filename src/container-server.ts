#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';

// Import schemas
import {
  CreateSessionSchema,
  ExecuteInSessionSchema,
  TransferFilesSchema,
  ExecuteCommandSchema,
  SessionIdSchema,
  GetLogsSchema,
} from './types/schemas.js';

// Import services
import { DockerManager } from './docker/manager.js';
import { SessionManager } from './services/session-manager.js';

// Import handlers
import { SessionHandler } from './handlers/session.js';
import { ExecutionHandler } from './handlers/execution.js';
import { TransferHandler } from './handlers/transfer.js';
import { LogsHandler } from './handlers/logs.js';

class ClaudeCodeContainerServer {
  private server: Server;
  private dockerManager: DockerManager;
  private sessionManager: SessionManager;
  
  // Handlers
  private sessionHandler: SessionHandler;
  private executionHandler: ExecutionHandler;
  private transferHandler: TransferHandler;
  private logsHandler: LogsHandler;

  constructor() {
    console.error('Claude Code Container MCP Server starting...');
    
    // Initialize services
    this.dockerManager = new DockerManager();
    this.sessionManager = new SessionManager(this.dockerManager);
    
    // Initialize handlers
    this.sessionHandler = new SessionHandler(this.sessionManager);
    this.executionHandler = new ExecutionHandler(this.sessionManager, this.dockerManager);
    this.transferHandler = new TransferHandler(this.sessionManager, this.dockerManager);
    this.logsHandler = new LogsHandler(this.sessionManager, this.dockerManager);

    // Initialize server
    this.server = new Server(
      {
        name: 'claude-code-container',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandler();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_session',
          description: 'Create a new Claude Code container session',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to mount in the container'
              },
              sessionName: {
                type: 'string',
                description: 'Optional session name'
              },
              apiKey: {
                type: 'string',
                description: 'Anthropic API key for this session'
              },
              useBedrock: {
                type: 'boolean',
                description: 'Use AWS Bedrock instead of Anthropic API'
              },
              awsRegion: {
                type: 'string',
                description: 'AWS region for Bedrock'
              },
              awsAccessKeyId: {
                type: 'string',
                description: 'AWS access key ID'
              },
              awsSecretAccessKey: {
                type: 'string',
                description: 'AWS secret access key'
              },
              awsSessionToken: {
                type: 'string',
                description: 'AWS session token'
              },
              bedrockModel: {
                type: 'string',
                description: 'Bedrock model ID'
              },
              bedrockSmallModel: {
                type: 'string',
                description: 'Bedrock small/fast model ID'
              }
            },
            required: ['projectPath']
          },
        },
        {
          name: 'execute_in_session',
          description: 'Execute Claude Code in a specific session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID'
              },
              prompt: {
                type: 'string',
                description: 'Prompt for Claude Code'
              },
              tools: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Specific tools to enable'
              }
            },
            required: ['sessionId', 'prompt']
          },
        },
        {
          name: 'list_sessions',
          description: 'List all active sessions',
          inputSchema: {
            type: 'object',
            properties: {}
          },
        },
        {
          name: 'destroy_session',
          description: 'Destroy a Claude Code session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID'
              }
            },
            required: ['sessionId']
          },
        },
        {
          name: 'transfer_files',
          description: 'Transfer files between host and container',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID'
              },
              direction: {
                type: 'string',
                enum: ['to_container', 'from_container'],
                description: 'Transfer direction'
              },
              sourcePath: {
                type: 'string',
                description: 'Source path'
              },
              destPath: {
                type: 'string',
                description: 'Destination path'
              }
            },
            required: ['sessionId', 'direction', 'sourcePath', 'destPath']
          },
        },
        {
          name: 'execute_command',
          description: 'Execute arbitrary command in container',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID'
              },
              command: {
                type: 'string',
                description: 'Command to execute'
              }
            },
            required: ['sessionId', 'command']
          },
        },
        {
          name: 'get_session_logs',
          description: 'Get container logs for debugging',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID'
              },
              tail: {
                type: 'number',
                description: 'Number of lines to tail',
                default: 100
              }
            },
            required: ['sessionId']
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ServerResult> => {
      const { name: toolName, arguments: args } = request.params;
      
      console.error(`[Tool] ${toolName} called with args:`, JSON.stringify(args, null, 2));

      try {
        switch (toolName) {
          case 'create_session':
            return await this.sessionHandler.createSession(CreateSessionSchema.parse(args));
          
          case 'execute_in_session':
            return await this.executionHandler.executeInSession(ExecuteInSessionSchema.parse(args));
          
          case 'list_sessions':
            return await this.sessionHandler.listSessions();
          
          case 'destroy_session':
            return await this.sessionHandler.destroySession(SessionIdSchema.parse(args));
          
          case 'transfer_files':
            return await this.transferHandler.transferFiles(TransferFilesSchema.parse(args));
          
          case 'execute_command':
            return await this.executionHandler.executeCommand(ExecuteCommandSchema.parse(args));
          
          case 'get_session_logs':
            return await this.logsHandler.getSessionLogs(GetLogsSchema.parse(args));
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }
      } catch (error: any) {
        console.error(`[Tool Error] ${toolName}:`, error);
        
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool ${toolName} failed: ${error.message}`
        );
      }
    });
  }

  private setupErrorHandler() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code Container MCP server running on stdio');
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ClaudeCodeContainerServer();
  server.start().catch(console.error);
}

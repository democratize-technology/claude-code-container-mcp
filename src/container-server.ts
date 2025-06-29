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
          inputSchema: CreateSessionSchema,
        },
        {
          name: 'execute_in_session',
          description: 'Execute Claude Code in a specific session',
          inputSchema: ExecuteInSessionSchema,
        },
        {
          name: 'list_sessions',
          description: 'List all active sessions',
          inputSchema: {},
        },
        {
          name: 'destroy_session',
          description: 'Destroy a Claude Code session',
          inputSchema: SessionIdSchema,
        },
        {
          name: 'transfer_files',
          description: 'Transfer files between host and container',
          inputSchema: TransferFilesSchema,
        },
        {
          name: 'execute_command',
          description: 'Execute arbitrary command in container',
          inputSchema: ExecuteCommandSchema,
        },
        {
          name: 'get_session_logs',
          description: 'Get container logs for debugging',
          inputSchema: GetLogsSchema,
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

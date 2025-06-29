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
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { DockerManager } from './docker-manager.js';

const CreateSessionSchema = z.object({
  projectPath: z.string().describe('Path to mount in the container'),
  sessionName: z.string().optional().describe('Optional session name'),
  apiKey: z.string().optional().describe('Anthropic API key for this session'),
  useBedrock: z.boolean().optional().describe('Use AWS Bedrock instead of Anthropic API'),
  awsRegion: z.string().optional().describe('AWS region for Bedrock'),
  awsAccessKeyId: z.string().optional().describe('AWS access key ID'),
  awsSecretAccessKey: z.string().optional().describe('AWS secret access key'),
  awsSessionToken: z.string().optional().describe('AWS session token'),
  bedrockModel: z.string().optional().describe('Bedrock model ID'),
  bedrockSmallModel: z.string().optional().describe('Bedrock small/fast model ID')
});

const ExecuteInSessionSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  prompt: z.string().describe('Prompt for Claude Code'),
  tools: z.array(z.string()).optional().describe('Specific tools to enable')
});

const TransferFilesSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  direction: z.enum(['to_container', 'from_container']).describe('Transfer direction'),
  sourcePath: z.string().describe('Source path'),
  destPath: z.string().describe('Destination path')
});

const ExecuteCommandSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  command: z.string().describe('Command to execute')
});

const SessionIdSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

const GetLogsSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  tail: z.number().optional().default(100).describe('Number of lines to tail')
});

interface Session {
  id: string;
  name: string;
  containerId: string;
  containerName: string;
  projectPath: string;
  createdAt: string;
  status: 'running' | 'stopped' | 'error';
  useBedrock: boolean;
}

class ClaudeCodeContainerServer {
  private server: Server;
  private dockerManager: DockerManager;
  private sessions: Map<string, Session>;

  constructor() {
    this.sessions = new Map();
    this.dockerManager = new DockerManager();
    
    this.server = new Server(
      {
        name: 'claude-code-container',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_session',
          description: 'Create a new Claude Code container session (supports both Anthropic API and AWS Bedrock)',
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
                description: 'Anthropic API key (if using Anthropic API)'
              },
              useBedrock: {
                type: 'boolean',
                description: 'Use AWS Bedrock instead of Anthropic API'
              },
              awsRegion: {
                type: 'string',
                description: 'AWS region for Bedrock (e.g., us-east-1)'
              },
              awsAccessKeyId: {
                type: 'string',
                description: 'AWS access key ID (if not using default credentials)'
              },
              awsSecretAccessKey: {
                type: 'string',
                description: 'AWS secret access key (if not using default credentials)'
              },
              awsSessionToken: {
                type: 'string',
                description: 'AWS session token (for temporary credentials)'
              },
              bedrockModel: {
                type: 'string',
                description: 'Bedrock model ID (default: us.anthropic.claude-opus-4-20250514-v1:0)'
              },
              bedrockSmallModel: {
                type: 'string',
                description: 'Bedrock small/fast model ID (default: us.anthropic.claude-3-5-haiku-20241022-v1:0)'
              }
            },
            required: ['projectPath']
          },
        },
        {
          name: 'execute_in_session',
          description: 'Execute a Claude Code command in a session',
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
                items: { type: 'string' },
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
            properties: {},
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
                description: 'Session ID to destroy'
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
                description: 'Number of lines to tail'
              }
            },
            required: ['sessionId']
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ServerResult> => {
      const toolName = request.params.name;
      const args = request.params.arguments as any;

      try {
        switch (toolName) {
          case 'create_session':
            console.error('Raw args for create_session:', args);
            const parsedArgs = CreateSessionSchema.parse(args);
            console.error('Parsed args:', parsedArgs);
            return await this.createSession(parsedArgs);
          case 'execute_in_session':
            return await this.executeInSession(ExecuteInSessionSchema.parse(args));
          case 'list_sessions':
            return await this.listSessions();
          case 'destroy_session':
            return await this.destroySession(SessionIdSchema.parse(args));
          case 'transfer_files':
            return await this.transferFiles(TransferFilesSchema.parse(args));
          case 'execute_command':
            return await this.executeCommand(ExecuteCommandSchema.parse(args));
          case 'get_session_logs':
            return await this.getSessionLogs(GetLogsSchema.parse(args));
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async createSession(params: z.infer<typeof CreateSessionSchema>): Promise<ServerResult> {
    const sessionId = uuidv4();
    const containerName = `claude-code-${sessionId.slice(0, 8)}`;
    
    try {
      // If using Bedrock and no AWS credentials provided, use environment defaults
      const createParams = {
        name: containerName,
        ...params
      };
      
      if (params.useBedrock && !params.awsAccessKeyId) {
        createParams.awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
        createParams.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        createParams.awsSessionToken = process.env.AWS_SESSION_TOKEN;
      }
      
      const { containerId } = await this.dockerManager.createClaudeContainer(createParams);

      const session: Session = {
        id: sessionId,
        name: params.sessionName || sessionId,
        containerId,
        containerName,
        projectPath: params.projectPath,
        createdAt: new Date().toISOString(),
        status: 'running',
        useBedrock: params.useBedrock || false,
      };

      this.sessions.set(sessionId, session);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Session created successfully (${params.useBedrock ? 'AWS Bedrock' : 'Anthropic API'})`,
              sessionId,
              containerName,
              projectPath: params.projectPath,
              useBedrock: params.useBedrock || false,
              ...(params.useBedrock && { awsRegion: params.awsRegion }),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('Full error in createSession:', error);
      console.error('Error stack:', error.stack);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create session: ${error.message || String(error)}`
      );
    }
  }

  private async executeInSession({ sessionId, prompt, tools = [] }: z.infer<typeof ExecuteInSessionSchema>): Promise<ServerResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session ${sessionId} not found`
      );
    }

    try {
      const result = await this.dockerManager.executeClaudeCode({
        containerId: session.containerId,
        prompt,
        tools,
      });

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Execution failed: ${error.message}`
      );
    }
  }

  private async listSessions(): Promise<ServerResult> {
    const sessions = Array.from(this.sessions.values());
    
    // Update session statuses
    for (const session of sessions) {
      try {
        const isRunning = await this.dockerManager.isContainerRunning(session.containerId);
        session.status = isRunning ? 'running' : 'stopped';
      } catch {
        session.status = 'error';
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(sessions, null, 2),
        },
      ],
    };
  }

  private async destroySession({ sessionId }: z.infer<typeof SessionIdSchema>): Promise<ServerResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session ${sessionId} not found`
      );
    }

    try {
      await this.dockerManager.destroyContainer(session.containerId);
      this.sessions.delete(sessionId);

      return {
        content: [
          {
            type: 'text',
            text: `Session ${sessionId} destroyed successfully`,
          },
        ],
      };
    } catch (error: any) {
      // If container doesn't exist, still clean up the session
      if (error.message?.includes('No such container') || 
          error.message?.includes('is not running')) {
        this.sessions.delete(sessionId);
        
        return {
          content: [
            {
              type: 'text',
              text: `Session ${sessionId} cleaned up (container was already removed)`,
            },
          ],
        };
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to destroy session: ${error.message}`
      );
    }
  }

  private async transferFiles({ sessionId, direction, sourcePath, destPath }: z.infer<typeof TransferFilesSchema>): Promise<ServerResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session ${sessionId} not found`
      );
    }

    try {
      await this.dockerManager.transferFiles({
        containerId: session.containerId,
        direction,
        sourcePath,
        destPath,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Files transferred successfully: ${sourcePath} -> ${destPath}`,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `File transfer failed: ${error.message}`
      );
    }
  }

  private async executeCommand({ sessionId, command }: z.infer<typeof ExecuteCommandSchema>): Promise<ServerResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session ${sessionId} not found`
      );
    }

    try {
      const result = await this.dockerManager.executeCommand(session.containerId, command);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Command execution failed: ${error.message}`
      );
    }
  }

  private async getSessionLogs({ sessionId, tail }: z.infer<typeof GetLogsSchema>): Promise<ServerResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session ${sessionId} not found`
      );
    }

    try {
      const logs = await this.dockerManager.getContainerLogs(session.containerId, tail);

      return {
        content: [
          {
            type: 'text',
            text: logs,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get logs: ${error.message}`
      );
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    if (process.env.MCP_CLAUDE_DEBUG === 'true') {
      console.error('Claude Code Container MCP server started');
    }
  }
}

// Start the server
const server = new ClaudeCodeContainerServer();
server.start().catch(console.error);

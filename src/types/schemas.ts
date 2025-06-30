import { z } from 'zod';

// MCP mount configuration
export const McpMountSchema = z.object({
  hostPath: z.string().describe('Path on Docker host'),
  containerPath: z.string().describe('Path in container'),
  readOnly: z.boolean().optional().default(true).describe('Mount as read-only')
});

// Session management schemas
export const CreateSessionSchema = z.object({
  projectPath: z.string().describe('Path to mount in the container'),
  sessionName: z.string().optional().describe('Optional session name'),
  apiKey: z.string().optional().describe('Anthropic API key for this session'),
  useBedrock: z.boolean().optional().describe('Use AWS Bedrock instead of Anthropic API'),
  awsRegion: z.string().optional().describe('AWS region for Bedrock'),
  awsAccessKeyId: z.string().optional().describe('AWS access key ID'),
  awsSecretAccessKey: z.string().optional().describe('AWS secret access key'),
  awsSessionToken: z.string().optional().describe('AWS session token'),
  bedrockModel: z.string().optional().describe('Bedrock model ID'),
  bedrockSmallModel: z.string().optional().describe('Bedrock small/fast model ID'),
  mcpMounts: z.array(McpMountSchema).optional().describe('MCP server directories to mount'),
  mcpConfig: z.object({
    mcpServers: z.record(z.any())
  }).optional().describe('MCP configuration to write to container')
});

export const SessionIdSchema = z.object({
  sessionId: z.string().describe('Session ID')
});

// Execution schemas
export const ExecuteInSessionSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  prompt: z.string().describe('Prompt for Claude Code'),
  tools: z.array(z.string()).optional().describe('Specific tools to enable')
});

export const ExecuteCommandSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  command: z.string().describe('Command to execute')
});

// File transfer schemas
export const TransferFilesSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  direction: z.enum(['to_container', 'from_container']).describe('Transfer direction'),
  sourcePath: z.string().describe('Source path'),
  destPath: z.string().describe('Destination path')
});

// Logging schemas
export const GetLogsSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  tail: z.number().optional().default(100).describe('Number of lines to tail')
});

// Type exports
export type CreateSessionParams = z.infer<typeof CreateSessionSchema>;
export type ExecuteInSessionParams = z.infer<typeof ExecuteInSessionSchema>;
export type TransferFilesParams = z.infer<typeof TransferFilesSchema>;
export type ExecuteCommandParams = z.infer<typeof ExecuteCommandSchema>;
export type SessionIdParams = z.infer<typeof SessionIdSchema>;
export type GetLogsParams = z.infer<typeof GetLogsSchema>;
export type McpMount = z.infer<typeof McpMountSchema>;

// Session interface
export interface Session {
  id: string;
  name: string;
  containerId: string;
  containerName: string;
  projectPath: string;
  createdAt: Date;
  mcpMounts?: McpMount[];
}

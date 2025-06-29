import { ServerResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../services/session-manager.js';
import { DockerManager } from '../docker/manager.js';
import { ExecuteInSessionParams, ExecuteCommandParams } from '../types/schemas.js';

export class ExecutionHandler {
  constructor(
    private sessionManager: SessionManager,
    private dockerManager: DockerManager
  ) {}

  async executeInSession({ sessionId, prompt, tools = [] }: ExecuteInSessionParams): Promise<ServerResult> {
    const session = this.sessionManager.getOrThrow(sessionId);
    
    try {
      const output = await this.dockerManager.executeClaudeCode({
        containerId: session.containerId,
        prompt,
        tools
      });

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute in session: ${error.message}`
      );
    }
  }

  async executeCommand({ sessionId, command }: ExecuteCommandParams): Promise<ServerResult> {
    const session = this.sessionManager.getOrThrow(sessionId);
    
    try {
      const output = await this.dockerManager.executeCommand(session.containerId, command);

      return {
        content: [
          {
            type: 'text',
            text: output || 'Command executed successfully (no output)',
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute command: ${error.message}`
      );
    }
  }
}

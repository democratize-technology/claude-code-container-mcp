import { ServerResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../services/session-manager.js';
import { DockerManager } from '../docker/manager.js';
import { GetLogsParams } from '../types/schemas.js';

export class LogsHandler {
  constructor(
    private sessionManager: SessionManager,
    private dockerManager: DockerManager
  ) {}

  async getSessionLogs({ sessionId, tail }: GetLogsParams): Promise<ServerResult> {
    const session = this.sessionManager.getOrThrow(sessionId);
    
    try {
      const logs = await this.dockerManager.getContainerLogs(session.containerId, tail);

      return {
        content: [
          {
            type: 'text',
            text: logs || 'No logs available',
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
}

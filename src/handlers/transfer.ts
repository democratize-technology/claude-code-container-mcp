import { ServerResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../services/session-manager.js';
import { DockerManager } from '../docker/manager.js';
import { TransferFilesParams } from '../types/schemas.js';

export class TransferHandler {
  constructor(
    private sessionManager: SessionManager,
    private dockerManager: DockerManager
  ) {}

  async transferFiles({ sessionId, direction, sourcePath, destPath }: TransferFilesParams): Promise<ServerResult> {
    const session = this.sessionManager.getOrThrow(sessionId);
    
    try {
      await this.dockerManager.transferFiles({
        containerId: session.containerId,
        direction,
        sourcePath,
        destPath
      });

      return {
        content: [
          {
            type: 'text',
            text: `Files transferred successfully from ${sourcePath} to ${destPath}`,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to transfer files: ${error.message}`
      );
    }
  }
}

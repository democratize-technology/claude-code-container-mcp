import { ServerResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../services/session-manager.js';
import { CreateSessionParams, SessionIdParams } from '../types/schemas.js';

export class SessionHandler {
  constructor(private sessionManager: SessionManager) {}

  async createSession(params: CreateSessionParams): Promise<ServerResult> {
    const session = await this.sessionManager.create(params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: `Session created successfully (${params.useBedrock ? 'AWS Bedrock' : 'Anthropic API'})`,
            sessionId: session.id,
            containerName: session.containerName,
            projectPath: session.projectPath,
            useBedrock: params.useBedrock || false,
            ...(params.useBedrock && { awsRegion: params.awsRegion }),
            ...(params.mcpMounts && { mcpMounts: params.mcpMounts }),
          }, null, 2),
        },
      ],
    };
  }

  async listSessions(): Promise<ServerResult> {
    const sessions = this.sessionManager.list();
    
    return {
      content: [
        {
          type: 'text',
          text: sessions.length > 0
            ? `Active sessions:\n${sessions.map(s => `- ${s.id}: ${s.name} (${s.containerName})`).join('\n')}`
            : 'No active sessions',
        },
      ],
    };
  }

  async destroySession({ sessionId }: SessionIdParams): Promise<ServerResult> {
    try {
      await this.sessionManager.destroy(sessionId);
      
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
        
        return {
          content: [
            {
              type: 'text',
              text: `Session ${sessionId} cleaned up (container was already removed)`,
            },
          ],
        };
      }
      
      throw error;
    }
  }
}

import { v4 as uuidv4 } from 'uuid';
import { Session, McpMount } from '../types/schemas.js';
import { DockerManager } from '../docker/manager.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  
  constructor(private dockerManager: DockerManager) {}

  async create(params: {
    projectPath: string;
    sessionName?: string;
    apiKey?: string;
    useBedrock?: boolean;
    awsRegion?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsSessionToken?: string;
    bedrockModel?: string;
    bedrockSmallModel?: string;
    mcpMounts?: McpMount[];
    mcpConfig?: { mcpServers: Record<string, any> };
  }): Promise<Session> {
    const sessionId = uuidv4();
    const sessionName = params.sessionName || `claude-session-${Date.now()}`;
    const containerName = `claude-code-${sessionId.slice(0, 8)}`;
    
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
      name: sessionName,
      containerId,
      containerName,
      projectPath: params.projectPath,
      createdAt: new Date(),
      mcpMounts: params.mcpMounts
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async destroy(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.dockerManager.destroyContainer(session.containerId);
    this.sessions.delete(sessionId);
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  getOrThrow(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }
}

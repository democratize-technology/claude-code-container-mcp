import Docker from 'dockerode';
import { Readable } from 'stream';
import { promisify } from 'util';
import { exec, execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

interface CreateContainerOptions {
  name: string;
  projectPath: string;
  apiKey?: string;
  useBedrock?: boolean;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  bedrockModel?: string;
  bedrockSmallModel?: string;
}

interface ExecuteClaudeOptions {
  containerId: string;
  prompt: string;
  tools?: string[];
}

interface TransferOptions {
  containerId: string;
  direction: 'to_container' | 'from_container';
  sourcePath: string;
  destPath: string;
}

export class DockerManager {
  private docker: Docker | null = null;
  private defaultImage: string;

  constructor() {
    console.error('[DockerManager] Constructor called at', new Date().toISOString());
    console.error('[DockerManager] DOCKER_HOST from environment:', process.env.DOCKER_HOST);

    // Only create Docker client for non-SSH connections
    if (!process.env.DOCKER_HOST?.startsWith('ssh://')) {
      // Create Docker client - it will use DOCKER_HOST if set
      this.docker = new Docker();
    } else {
      console.error('[DockerManager] Skipping dockerode client creation for SSH connection');
    }

    this.defaultImage = process.env.DEFAULT_CLAUDE_IMAGE || 'ghcr.io/zeeno-atl/claude-code:latest';
  }

  async createClaudeContainer(options: CreateContainerOptions): Promise<{ containerId: string }> {
    const {
      name,
      projectPath,
      apiKey,
      useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === 'true',
      awsRegion = process.env.AWS_REGION,
      awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY,
      awsSessionToken = process.env.AWS_SESSION_TOKEN,
      bedrockModel = process.env.ANTHROPIC_MODEL || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      bedrockSmallModel = process.env.ANTHROPIC_SMALL_FAST_MODEL || 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    } = options;

    console.error(`Creating Claude Code container with:`, {
      name,
      projectPath,
      useBedrock,
      awsRegion,
      bedrockModel,
      hasApiKey: !!apiKey,
      hasAwsKeyId: !!awsAccessKeyId,
      hasAwsSecret: !!awsSecretAccessKey,
    });

    try {
      // Ensure the image is available
      console.error('Ensuring Docker image is available...');
      await this.ensureImageAvailable();
      console.error('Docker image check complete');

      // Build environment variables
      const envVars = [];

      if (useBedrock) {
        // Bedrock configuration
        envVars.push(
          'CLAUDE_CODE_USE_BEDROCK=true',
          `AWS_REGION=${awsRegion}`,
          `ANTHROPIC_MODEL=${bedrockModel}`,
          `ANTHROPIC_SMALL_FAST_MODEL=${bedrockSmallModel}`,
        );

        // AWS credentials if provided
        if (awsAccessKeyId) envVars.push(`AWS_ACCESS_KEY_ID=${awsAccessKeyId}`);
        if (awsSecretAccessKey) envVars.push(`AWS_SECRET_ACCESS_KEY=${awsSecretAccessKey}`);
        if (awsSessionToken) envVars.push(`AWS_SESSION_TOKEN=${awsSessionToken}`);

        console.error(
          'Bedrock env vars:',
          envVars.filter((v) => !v.includes('SECRET')),
        );
      } else {
        // Standard Anthropic API configuration
        envVars.push('CLAUDE_CODE_USE_BEDROCK=false');
        if (apiKey) {
          envVars.push(`ANTHROPIC_API_KEY=${apiKey}`);
        }
        // Use standard Anthropic model names
        envVars.push(
          'ANTHROPIC_MODEL=claude-3-5-sonnet-20241022',
          'ANTHROPIC_SMALL_FAST_MODEL=claude-3-haiku-20240307'
        );
      }

      console.error('Creating Docker container...');

      // For SSH connections, use Docker CLI instead of dockerode
      if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
        console.error('Using Docker CLI for SSH connection...');

        // Build docker run command
        const dockerArgs = [
          'run',
          '-d',
          '--rm',
          '--name',
          name,
          '-w',
          '/app',
          '-v',
          `${projectPath}:/app`,
          '-v',
          'claude-code-npm-cache:/npm-cache',
        ];

        // Add environment variables
        for (const env of envVars) {
          dockerArgs.push('-e', env);
        }

        // Add image and command
        dockerArgs.push(this.defaultImage, 'tail', '-f', '/dev/null');

        console.error('Docker command:', 'docker', dockerArgs.join(' '));

        try {
          const { stdout } = await execAsync(`docker ${dockerArgs.join(' ')}`);
          const containerId = stdout.trim();
          console.error('Container created via CLI with ID:', containerId);

          // Wait for container to be ready
          console.error('Waiting for container to be ready...');
          await this.waitForContainerReady(containerId);
          console.error('Container is ready!');

          return { containerId };
        } catch (error) {
          console.error('Error creating container via CLI:', error);
          throw error;
        }
      } else {
        // Use dockerode for local connections
        if (!this.docker) {
          throw new Error('Docker client not initialized');
        }
        const container = await this.docker.createContainer({
          name,
          Image: this.defaultImage,
          Cmd: ['tail', '-f', '/dev/null'],
          Env: envVars,
          HostConfig: {
            Binds: [`${projectPath}:/app`, 'claude-code-npm-cache:/npm-cache'],
            AutoRemove: false,
          },
          WorkingDir: '/app',
        });
        console.error('Docker container created successfully');

        console.error('Starting container...');
        await container.start();
        console.error('Container started successfully');

        // Wait for container to be ready
        console.error('Waiting for container to be ready...');
        await this.waitForContainerReady(container.id);
        console.error('Container is ready!');

        return { containerId: container.id };
      }
    } catch (error) {
      console.error('Error in createClaudeContainer:', error);
      throw error;
    }
  }

  async executeClaudeCode(options: ExecuteClaudeOptions): Promise<string> {
    const { containerId, prompt, tools = [] } = options;

    let claudeCmd = '/claude-wrapper.sh';

    if (tools.length > 0) {
      claudeCmd += ` --tools ${tools.join(',')}`;
    }

    // Escape the prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\"'\"'");

    if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
      // Use Docker CLI for SSH connections
      try {
        const { stdout } = await execAsync(
          `docker exec ${containerId} sh -c '${claudeCmd} '"'"'${escapedPrompt}'"'"''`,
        );
        return stdout;
      } catch (error: any) {
        if (error.stdout) return error.stdout;
        throw error;
      }
    } else {
      // Use dockerode for local connections
      if (!this.docker) {
        throw new Error('Docker client not initialized');
      }
      const exec = await this.docker.getContainer(containerId).exec({
        Cmd: ['sh', '-c', `${claudeCmd} '${escapedPrompt}'`],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      const output = await this.streamToString(stream);

      return output;
    }
  }

  async executeCommand(containerId: string, command: string): Promise<string> {
    if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
      // Use Docker CLI for SSH connections
      try {
        const { stdout } = await execAsync(`docker exec ${containerId} sh -c '${command.replace(/'/g, "'\"'\"'")}'`);
        return stdout;
      } catch (error: any) {
        if (error.stdout) return error.stdout;
        throw error;
      }
    } else {
      // Use dockerode for local connections
      if (!this.docker) {
        throw new Error('Docker client not initialized');
      }
      const exec = await this.docker.getContainer(containerId).exec({
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      const output = await this.streamToString(stream);

      return output;
    }
  }

  async transferFiles(options: TransferOptions): Promise<void> {
    const { containerId, direction, sourcePath, destPath } = options;

    if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
      // Use Docker CLI for SSH connections
      if (direction === 'to_container') {
        await execAsync(`docker cp "${sourcePath}" ${containerId}:"${destPath}"`);
      } else {
        await execAsync(`docker cp ${containerId}:"${sourcePath}" "${destPath}"`);
      }
    } else {
      // Use dockerode for local connections
      if (!this.docker) {
        throw new Error('Docker client not initialized');
      }
      const container = this.docker.getContainer(containerId);

      if (direction === 'to_container') {
        // Transfer from host to container
        const stats = await fs.stat(sourcePath);

        if (stats.isDirectory()) {
          // For directories, use tar
          await execAsync(`docker cp "${sourcePath}" ${containerId}:"${destPath}"`);
        } else {
          // For single files
          const content = await fs.readFile(sourcePath);
          await container.putArchive(content, { path: path.dirname(destPath) });
        }
      } else {
        // Transfer from container to host
        await execAsync(`docker cp ${containerId}:"${sourcePath}" "${destPath}"`);
      }
    }
  }

  async destroyContainer(containerId: string): Promise<void> {
    if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
      // Use Docker CLI for SSH connections
      try {
        await execAsync(`docker stop ${containerId}`);
      } catch (error: any) {
        // Container might already be stopped
        if (!error.stderr?.includes('is not running')) {
          throw error;
        }
      }

      try {
        await execAsync(`docker rm ${containerId}`);
      } catch (error: any) {
        // Container might already be removed
        if (!error.stderr?.includes('No such container')) {
          throw error;
        }
      }
    } else {
      // Use dockerode for local connections
      if (!this.docker) {
        throw new Error('Docker client not initialized');
      }
      const container = this.docker.getContainer(containerId);

      try {
        await container.stop();
      } catch (error: any) {
        // Container might already be stopped
        if (error.statusCode !== 304) {
          throw error;
        }
      }

      try {
        await container.remove();
      } catch (error: any) {
        // Container might already be removed (404 = Not Found)
        if (error.statusCode !== 404) {
          throw error;
        }
      }
    }
  }

  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
        // Use Docker CLI for SSH connections
        const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`);
        return stdout.trim() === 'true';
      } else {
        // Use dockerode for local connections
        if (!this.docker) {
          throw new Error('Docker client not initialized');
        }
        const container = this.docker.getContainer(containerId);
        const info = await container.inspect();
        return info.State.Running;
      }
    } catch {
      return false;
    }
  }

  async getContainerLogs(containerId: string, tail: number = 100): Promise<string> {
    if (process.env.DOCKER_HOST?.startsWith('ssh://')) {
      // Use Docker CLI for SSH connections
      const { stdout } = await execAsync(`docker logs --tail ${tail} --timestamps ${containerId}`);
      return stdout;
    } else {
      // Use dockerode for local connections
      if (!this.docker) {
        throw new Error('Docker client not initialized');
      }
      const container = this.docker.getContainer(containerId);

      // Explicitly set follow to false to get Buffer return type
      const buffer = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
        follow: false,
      });

      // Now we know it's a Buffer
      return buffer.toString('utf8');
    }
  }

  private async ensureImageAvailable(): Promise<void> {
    try {
      console.error(`[ensureImageAvailable] Checking for image: ${this.defaultImage}`);

      // Use Docker CLI instead of dockerode for SSH connections
      try {
        await execAsync(`docker image inspect ${this.defaultImage}`);
        console.error(`[ensureImageAvailable] Image found`);
      } catch (error: any) {
        if (error.stderr && error.stderr.includes('No such image')) {
          console.error(`[ensureImageAvailable] Image not found, pulling ${this.defaultImage}...`);
          const { stdout, stderr } = await execAsync(`docker pull ${this.defaultImage}`);
          console.error(`[ensureImageAvailable] Pull complete`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`[ensureImageAvailable] Error:`, error);
      throw error;
    }
  }

  private async waitForContainerReady(containerId: string, maxAttempts: number = 60): Promise<void> {
    console.error(`Waiting for container ${containerId} to be ready...`);

    // Give container a moment to fully start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.executeCommand(containerId, '/claude-wrapper.sh --version');
        console.error(`Attempt ${i + 1}: Got result: ${result}`);

        if (result.includes('Claude Code')) {
          console.error('Container is ready!');
          return;
        }
      } catch (error) {
        console.error(`Attempt ${i + 1}: Error: ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`Container failed to become ready after ${maxAttempts} attempts`);
  }

  private streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';

      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexed stream format handling
        if (chunk[0] === 1 || chunk[0] === 2) {
          // Skip the 8-byte header
          output += chunk.slice(8).toString();
        } else {
          output += chunk.toString();
        }
      });

      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  }
}

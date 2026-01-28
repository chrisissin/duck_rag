// src/services/automation/gcpMcpServer.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const server = new Server(
  { 
    name: "gcp-autoheal", 
    version: "1.0.0" 
  }, 
  { 
    capabilities: { 
      tools: {} 
    } 
  }
);

/**
 * TOOL 1: DISCOVERY
 * Finds the Zone and Instance Group (MIG) for a given instance name.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "discover_instance_metadata",
        description: "Finds the project, zone, and MIG name for a specific instance",
        inputSchema: {
          type: "object",
          properties: {
            instanceName: { type: "string", description: "Instance name to look up" }
          },
          required: ["instanceName"]
        }
      },
      {
        name: "execute_recreate_instance",
        description: "Recreates an instance in a Managed Instance Group",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "GCP project ID" },
            zone: { type: "string", description: "GCP zone" },
            migName: { type: "string", description: "Managed Instance Group name" },
            instanceName: { type: "string", description: "Instance name to recreate" }
          },
          required: ["projectId", "zone", "migName", "instanceName"]
        }
      },
      {
        name: "execute_gcloud_command",
        description: "Executes an arbitrary gcloud command. Use this for executing gcloud commands from action templates.",
        inputSchema: {
          type: "object",
          properties: {
            command: { 
              type: "string", 
              description: "The full gcloud command to execute (e.g., 'gcloud compute ssh instance-name --zone=us-central1-a --project=my-project --command=\"ls -la\"')" 
            }
          },
          required: ["command"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "discover_instance_metadata") {
    try {
      const { instanceName } = args;
      
      // Use gcloud command to discover instance metadata
      const gcloudCmd = `gcloud compute instances describe ${instanceName} --format="json(zone,name)" --project=$(gcloud config get-value project 2>/dev/null || echo '')`;
      
      try {
        const { stdout } = await execAsync(gcloudCmd);
        const instanceInfo = JSON.parse(stdout);
        const zone = instanceInfo.zone ? instanceInfo.zone.split('/').pop() : 'unknown';
        
        // Try to get project ID from gcloud config
        const { stdout: projectId } = await execAsync('gcloud config get-value project 2>/dev/null || echo ""');
        
        // MIG name is harder to get via gcloud, so we'll return unknown for now
        const migName = "unknown";
        
        return {
          content: [{ type: "text", text: JSON.stringify({ zone, migName, projectId: projectId.trim() || null }) }]
        };
      } catch (gcloudErr) {
        // Fallback: return error
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Failed to discover instance: ${gcloudErr.message}. Make sure gcloud is configured and the instance exists.` }) }],
          isError: true
        };
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
        isError: true
      };
    }
  }

  if (name === "execute_recreate_instance") {
    try {
      const { projectId, zone, migName, instanceName } = args;
      
      // Use gcloud command to recreate instance
      const gcloudCmd = `gcloud compute instance-groups managed recreate-instances ${migName} --instances=${instanceName} --zone=${zone}${projectId ? ` --project=${projectId}` : ''}`;
      
      try {
        const { stdout, stderr } = await execAsync(gcloudCmd);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: `Successfully triggered recreation for ${instanceName} in ${migName}`, output: stdout || stderr }) }]
        };
      } catch (gcloudErr) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `GCP Error: ${gcloudErr.message}`, stderr: gcloudErr.stderr || "" }) }],
          isError: true
        };
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `GCP Error: ${err.message}` }) }],
        isError: true
      };
    }
  }

  if (name === "execute_gcloud_command") {
    try {
      const { command } = args;
      
      // Security: Only allow gcloud commands
      if (!command.trim().startsWith("gcloud")) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Only gcloud commands are allowed" }) }],
          isError: true
        };
      }

      // Execute the gcloud command
      console.log(`[MCP Server] Executing gcloud command: ${command}`);
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 300000 // 5 minute timeout
      });

      const output = stdout || stderr || "";
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            success: true, 
            command,
            stdout: output,
            message: `Command executed successfully` 
          }) 
        }]
      };
    } catch (err) {
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            error: `Command execution failed: ${err.message}`,
            stderr: err.stderr || "",
            stdout: err.stdout || ""
          }) 
        }],
        isError: true
      };
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
    isError: true
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

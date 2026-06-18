const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { fetchSerialDataInternal } = require("./neptune-api");

// Create the MCP server
const server = new Server({
  name: "sap-neptune-api-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Implement list tools capability
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_serial_details",
        description: "Fetches live registration details of a serial number from SAP Neptune API database.",
        inputSchema: {
          type: "object",
          properties: {
            serialNumber: {
              type: "string",
              description: "The unique serial number of the hardware device or item to look up."
            }
          },
          required: ["serialNumber"]
        }
      }
    ]
  };
});

// Implement call tool capability
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_serial_details") {
    const { serialNumber } = request.params.arguments;
    if (!serialNumber) {
      throw new Error("Missing required argument: serialNumber");
    }

    try {
      console.error(`[MCP Server] Tool call: get_serial_details for serial ${serialNumber}`);
      const data = await fetchSerialDataInternal(String(serialNumber).trim());
      
      if (data.notFound) {
        return {
          content: [
            {
              type: "text",
              text: `Serial number "${serialNumber}" was not found in the SAP Neptune API database.`
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    } catch (err) {
      console.error(`[MCP Server] Error executing get_serial_details:`, err.message);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching details: ${err.message}`
          }
        ],
        isError: true
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

// Start the Stdio transport
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("[MCP Server] Connected and running over stdio transport.");
}).catch((err) => {
  console.error("[MCP Server] Failed to connect transport:", err);
});

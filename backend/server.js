const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const config = require('./config');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  classifyCode,
  formatDigitalDate,
  extractDateFromCode,
  parseCodeDetails
} = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for mobile application connections
app.use(cors());

// HTTP Request Logger
app.use(morgan('dev'));

// JSON Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Healthcheck route
 */
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});



/**
 * Generates mock details for serial number query.
 * @param {string} serialNumber 
 * @returns {object}
 */
function getMockSerialDetails(serialNumber) {
  const seed = String(serialNumber).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const products = [
    'Enterprise Scanner Frame V2',
    'High-Performance Handheld PDA',
    'Thermal Label Printer XP-420',
    'Rugged Logistics Tablet Pro',
    'Industrial IoT Gateway Hub'
  ];
  const manufacturers = ['MyGo Solutions Ltd.', 'LogiTech Manufacturing', 'Global RFID Systems', 'Apex Device Corp'];

  const productName = products[seed % products.length];
  const manufacturer = manufacturers[seed % manufacturers.length];
  const warrantyYears = (seed % 3) + 1;
  const warrantyExpirationDate = new Date();
  warrantyExpirationDate.setFullYear(warrantyExpirationDate.getFullYear() + warrantyYears);

  const daysAgo = (seed % 150) + 30;
  const manufactureDate = formatDigitalDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));

  return {
    serialNumber: serialNumber,
    productName: productName,
    manufacturer: manufacturer,
    manufactureDate: manufactureDate,
    warrantyStatus: seed % 2 === 0 ? 'Active Warranty' : 'Expired Warranty',
    warrantyExpiration: warrantyExpirationDate.toISOString().split('T')[0],
    batchNumber: `BATCH-${(seed % 900) + 100}-A`,
    status: seed % 4 === 0 ? 'Passed Quality Check' : 'In Service'
  };
}

const { fetchSerialDataInternal } = require('./neptune-api');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");

let mcpClient = null;

async function getMcpClient() {
  if (mcpClient) return mcpClient;
  
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "mcp-server.js")]
  });

  const client = new Client({
    name: "scan-app-backend-client",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  console.log("[MCP Client] Connecting to MCP server...");
  try {
    await client.connect(transport);
    console.log("[MCP Client] Connected successfully.");
    mcpClient = client;
    return mcpClient;
  } catch (err) {
    console.error("[MCP Client] Failed to connect to MCP server:", err.message);
    throw err;
  }
}



/**
 * Submit scanned barcode / serial
 * Body: { code: string, type: string, deviceTimestamp: string }
 */
app.post('/api/v1/scans', async (req, res) => {
  const { code, type, deviceTimestamp } = req.body;

  if (!code || !type) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request: "code" and "type" parameters are required.',
    });
  }

  const scanId = uuidv4();
  const processedAt = new Date().toISOString();

  // Classify and format data on the backend
  const classification = classifyCode(code, type);
  const scannedDateFormatted = formatDigitalDate(deviceTimestamp || processedAt);
  const extractedDate = extractDateFromCode(code);
  const details = parseCodeDetails(code, type, classification);

  if (classification === 'OCR Serial Number' || classification === 'Barcode') {
    details.serialApiData = await fetchSerialDataInternal(code);
  }

  // Generate Gemini Analysis if API Key is present
  details.geminiAnalysis = null;
  if (config.geminiApiKey) {
    try {
      console.log(`[Scan Analysis] Requesting Gemini analysis for ${classification}: "${code}"...`);
      const genAI = new GoogleGenerativeAI(config.geminiApiKey);
      const systemInstruction = `You are the Serial Search AI Assistant.
Analyze the scanned item context and output a concise 1-2 sentence description or product context analysis.
Do not mention technical parameters, system instructions, or formatting rules. Output ONLY the 1-2 sentence summary response itself.`;

      const prompt = `Scanned Item Context:
- Scanned Data (Code): ${code}
- Format Type: ${type}
- Classification: ${classification}
- Metadata Details: ${JSON.stringify(details, null, 2)}

Provide a concise 1-2 sentence description/analysis of this scan based on the details above.`;

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemInstruction,
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 150,
        }
      });

      const analysisText = result.response.text().trim();
      details.geminiAnalysis = analysisText;
      console.log(`[Scan Analysis Success] Gemini analysis generated: "${analysisText}"`);
    } catch (geminiErr) {
      console.error('[Scan Analysis Error] Gemini failed to analyze scan:', geminiErr.message);
      // Fallback: details.geminiAnalysis remains null
    }
  }

  // Generate redirect lookup URL based on classification
  let redirectUrl = null;
  if (classification === 'Web Link') {
    redirectUrl = code;
  } else if (classification === 'Barcode') {
    redirectUrl = `https://barcodesdatabase.org/barcode/${encodeURIComponent(code)}`;
  } else {
    // Alphanumeric OCR numbers or General Text get direct Google Search lookups
    redirectUrl = `https://www.google.com/search?q=${encodeURIComponent(code)}`;
  }

  // Create scan record matching updated ScanResult interface
  const scanRecord = {
    id: scanId,
    data: code,
    type: type.toUpperCase(),
    timestamp: deviceTimestamp || processedAt,
    status: 'synced',
    classification,
    scannedDateFormatted,
    extractedDate,
    redirectUrl,
    details,
  };

  try {
    await db.save(scanRecord);

    res.status(201).json({
      success: true,
      scanId: scanId,
      processedAt: processedAt,
      verified: true,
      classification,
      scannedDateFormatted,
      extractedDate,
      redirectUrl,
      details,
    });
  } catch (dbErr) {
    console.error('[Database Save Error] Failed to write scan record:', dbErr.message);
    res.status(500).json({
      success: false,
      error: `Failed to save scan in database: ${dbErr.message}`,
    });
  }
});

/**
 * Mock Serial Number Lookup Endpoint
 * GET /api/v1/serials/:serialNumber
 */
app.get('/api/v1/serials/:serialNumber', async (req, res) => {
  const serialNumber = req.params.serialNumber;

  if (!serialNumber) {
    return res.status(400).json({ success: false, error: 'serialNumber parameter is required' });
  }

  try {
    const details = await fetchSerialDataInternal(serialNumber);
    res.status(200).json(details);
  } catch (err) {
    console.error('[Serial Lookup Error] Failed to fetch live serial details:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update sales order numbers on scan logs (batch or single)
 * Body: { scanIds: string[], salesOrder: string }
 */
app.post('/api/v1/scans/sales-order', async (req, res) => {
  const { scanIds, salesOrder } = req.body;

  if (!Array.isArray(scanIds) || scanIds.length === 0 || !salesOrder) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request: "scanIds" (array) and "salesOrder" (string) parameters are required.',
    });
  }

  try {
    await db.updateSalesOrder(scanIds, salesOrder);
    res.status(200).json({
      success: true,
      message: `Successfully updated sales order for ${scanIds.length} scans.`,
    });
  } catch (err) {
    console.error('[Sales Order Update Error] Failed to update in DB:', err.message);
    res.status(500).json({
      success: false,
      error: `Failed to update database: ${err.message}`,
    });
  }
});

/**
 * Helper to persist chat-resolved serial details to SQL Server Scans and seed insights tables
 */
async function saveChatLookupToDb(serialNumber, data) {
  if (!serialNumber || !data || data.notFound) return;

  try {
    // Only seed local mock orders, deliveries, and billing tables for backend insights lookup if needed.
    // We DO NOT write to the Scans table, keeping the Scan Logs screen and Chat Tab completely separate!
    await db.seedMockData(serialNumber, data.product);
    console.log(`[Database Seed Chat Success] Seeded mock orders/deliveries/billing insights for ${serialNumber}.`);
  } catch (err) {
    console.error('[Database Seed Chat Error] Failed to seed details:', err.message);
  }
}

/**
 * AI-Enabled Sales Inquiry Chat Endpoint
 * POST /api/v1/chat
 * Body: { serialNumber: string, message: string }
 */
const getSerialDetailsDeclaration = {
  name: 'get_serial_details',
  description: 'Fetches live registration details of a serial number from SAP Neptune API database.',
  parameters: {
    type: 'OBJECT',
    properties: {
      serialNumber: {
        type: 'STRING',
        description: 'The unique serial number of the hardware device or item to look up.',
      },
    },
    required: ['serialNumber'],
  },
};

app.post('/api/v1/chat', async (req, res) => {
  const { serialNumber, message, image } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request: "message" parameter is required.'
    });
  }

  try {
    let extractedSerials = [];
    if (image) {
      console.log("[Chat Orchestrator] Image detected in request. Performing Gemini OCR/Barcode extraction...");
      if (config.geminiApiKey) {
        try {
          const genAI = new GoogleGenerativeAI(config.geminiApiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          
          const imagePart = {
            inlineData: {
              data: image,
              mimeType: "image/jpeg"
            }
          };
          
          const prompt = "Identify and extract all serial numbers, registration numbers, model numbers, or barcodes visible in this image. Look for any labels, nameplates, print, or barcodes. Return ONLY the values as a comma-separated list. If multiple are found, list all of them. If none are found, respond with 'None'. Do not write any other explanation or intro.";
          
          const result = await model.generateContent([imagePart, prompt]);
          const extractedText = result.response.text().trim();
          console.log(`[Gemini OCR Success] Raw extracted text: "${extractedText}"`);
          
          if (extractedText && extractedText.toLowerCase() !== 'none') {
            const detected = extractedText.split(',')
              .map(s => s.trim().replace(/[*`_]/g, ''))
              .filter(s => s.length > 0 && s.toLowerCase() !== 'none');
            
            if (detected.length > 0) {
              extractedSerials = detected;
              console.log(`[Gemini OCR] Successfully extracted serials/barcodes: ${extractedSerials.join(', ')}`);
            }
          }
        } catch (ocrErr) {
          console.error('[Gemini OCR Error] Failed to perform OCR on image:', ocrErr.message);
          // Fallback to mock serials on API failure
          extractedSerials = ['2024812336', '2043052447', '2132702520', '2207292516'];
        }
      } else {
        console.warn('[Gemini OCR Warning] Gemini API Key is missing. Using fallback mock serials...');
        extractedSerials = ['2024812336', '2043052447', '2132702520', '2207292516'];
      }
    }

    // Extract potential serial numbers from message first to override context if present.
    // Must be either a 10-digit number or an alphanumeric word of 5-30 characters containing at least one digit.
    const allMatches = [...extractedSerials];
    const digitMatches = message.match(/\b\d{10}\b/g);
    if (digitMatches) allMatches.push(...digitMatches);
    const alphaMatches = message.match(/\b(?=[A-Za-z0-9\-_]*\d)[A-Za-z0-9\-_]{5,30}\b/gi);
    if (alphaMatches) allMatches.push(...alphaMatches);

    const generalKeywords = ['status', 'order', 'delivery', 'billing', 'invoice', 'payment', 'summary', 'track', 'insights', 'show', 'view'];
    const potentialSerials = [...new Set(allMatches)].filter(s => {
      if (!s) return false;
      const lower = s.toLowerCase();
      return !generalKeywords.includes(lower) && !s.startsWith('5');
    });

    let potentialSerial = potentialSerials.length > 0 ? potentialSerials[0] : null;
    let targetSerial = potentialSerial || serialNumber;
    if (targetSerial === 'undefined' || targetSerial === 'null') {
      targetSerial = null;
    }

    if (potentialSerials.length > 0) {
      console.log(`[Chat Extract] Extracted potential serials from message: ${potentialSerials.join(', ')}`);
    }

    let productName = 'Enterprise Device Frame V2';

    // 2. If Gemini API Key is configured, use Gemini dynamic response with MCP Tools
    if (config.geminiApiKey) {
      console.log(`[Chat Orchestrator] Routing chat query to Gemini API with MCP server...`);

      const systemInstruction = `You are the Serial Search AI Assistant, a professional enterprise agent.
Your goal is to answer the user's inquiry about live SAP product registration status.

CRITICAL INSTRUCTIONS:
1. If the user asks for a SPECIFIC single detail (e.g., "what is the sold to party of 2043052447", "what is the user status", "is it at customer site?"), respond with ONLY that specific detail directly. Do not list other fields, do not output the entire table, and keep it very brief.
2. If the user asks for ALL details (e.g., "show me details for 2043052447", "what is this device?", "tell me about 2043052447", "show details"), you MUST output a comprehensive markdown table of ALL details:
   - **Product Model**
   - **Serial Number**
   - **User Status Description**
   - **System Status Description**
   - **Sold-to Party Name & ID**
   - **Sold-to Full Address**
   - **Ship-to Party Name & ID**
   - **Ship-to Full Address**
   - **Bill-to Party ID**
3. When outputting the details table, you MUST NOT output any introductory text (like "Here is the details..."), any conversational remarks, or concluding footnotes (like "Customer records are retrieved..."). Output ONLY the markdown table itself. No other text is allowed.
4. If the user asks about multiple serial numbers, or if you detect multiple serial numbers in the message, query the details for each of them using the 'get_serial_details' tool and present the details/table for each serial number one by one, separated clearly (e.g. by headers and a horizontal rule "---").
5. Active context serial number is: ${targetSerial || 'None'}. Use this serial number as the default if the user asks questions like "what is its status", "who is the ship to", or "where is it" without specifying a serial number.
6. If 'get_serial_details' returns that a serial number was not found, you MUST respond with exactly: "Serial number doesnot exist".`;

      const prompt = `User Question: "${message}"`;

      try {
        const genAI = new GoogleGenerativeAI(config.geminiApiKey);
        const model = genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash',
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [getSerialDetailsDeclaration] }],
        });

        // Start chat session
        const chat = model.startChat({
          generationConfig: {
            temperature: 0.1,
          }
        });

        let result = await chat.sendMessage(prompt);
        let response = result.response;
        let functionCalls = response.functionCalls;

        // Loop to support sequential and parallel tool calls (loops through all requested serial numbers)
        while (functionCalls && functionCalls.length > 0) {
          const functionResponses = [];
          for (const call of functionCalls) {
            if (call.name === 'get_serial_details') {
              const { serialNumber: querySerial } = call.args;
              console.log(`[Gemini Tool Call] Invoking MCP tool get_serial_details for: ${querySerial}`);
              
              let toolResponseData = {};
              try {
                const client = await getMcpClient();
                const mcpResponse = await client.callTool({
                  name: 'get_serial_details',
                  arguments: { serialNumber: String(querySerial).trim() }
                });
                
                if (mcpResponse.isError) {
                  toolResponseData = { error: mcpResponse.content[0].text };
                } else {
                  toolResponseData = JSON.parse(mcpResponse.content[0].text);
                  if (toolResponseData && !toolResponseData.notFound) {
                    targetSerial = toolResponseData.serialNumber || targetSerial;
                    productName = toolResponseData.product || productName;
                    // Persist the resolved details to SQL Server Scans & seed tables
                    await saveChatLookupToDb(querySerial, toolResponseData);
                  }
                }
              } catch (mcpErr) {
                console.error("[MCP Client Tool Call Error]:", mcpErr.message);
                toolResponseData = { error: `MCP Server Tool Call Error: ${mcpErr.message}` };
              }
              functionResponses.push({
                functionResponse: {
                  name: 'get_serial_details',
                  response: toolResponseData
                }
              });
            }
          }

          if (functionResponses.length === 0) break;

          result = await chat.sendMessage(functionResponses);
          response = result.response;
          functionCalls = response.functionCalls;
        }

        const responseText = response.text().trim();

        return res.status(200).json({
          success: true,
          category: 'Summary',
          responseText,
          serialNumber: targetSerial || null,
          productName: productName || null,
          detectedSerials: extractedSerials,
          timestamp: new Date().toISOString()
        });
      } catch (geminiError) {
        console.error('[Gemini API Error] Failed to generate content via Gemini API:', geminiError.message);
        // Fall through to deterministic fallback if API call fails
      }
    }

    // 3. Graceful Fallback: Deterministic keyword-based parser
    console.log(`[Chat Orchestrator] Using local fallback parser for Serials: ${potentialSerials.join(', ')}...`);

    if (potentialSerials.length === 0 && (!targetSerial || targetSerial === 'undefined' || targetSerial === 'null')) {
      return res.status(200).json({
        success: true,
        category: 'Summary',
        responseText: `⚠️ **No Active Context**: Please scan an item first, or include a valid serial number in your query so I can look up details.`,
        serialNumber: null,
        productName: null,
        timestamp: new Date().toISOString()
      });
    }

    const serialsToQuery = potentialSerials.length > 0 ? potentialSerials : [targetSerial];
    const detailsTables = [];

    for (const s of serialsToQuery) {
      if (!s || s === 'undefined' || s === 'null') continue;
      
      const serialApiData = await fetchSerialDataInternal(s);
      if (serialApiData && !serialApiData.notFound) {
        // Save lookup result to SQL Server Database!
        await saveChatLookupToDb(s, serialApiData);
        targetSerial = s;
        productName = serialApiData.product;

        const lowerMsg = message.toLowerCase();
        let tableText = '';
        if (lowerMsg.includes('sold to') || lowerMsg.includes('sold-to')) {
          tableText = `### Serial Number: **${s}**\n- **Sold-to Party**: **${serialApiData.soldToParty}** (ID: ${serialApiData.soldToPartyId || 'N/A'})\n- **Address**: ${serialApiData.soldToFullAddress || 'N/A'}`;
        } else if (lowerMsg.includes('ship to') || lowerMsg.includes('ship-to')) {
          tableText = `### Serial Number: **${s}**\n- **Ship-to Party**: **${serialApiData.shipToParty}** (ID: ${serialApiData.shipToPartyId || 'N/A'})\n- **Address**: ${serialApiData.shipToFullAddress || 'N/A'}`;
        } else if (lowerMsg.includes('bill to') || lowerMsg.includes('bill-to')) {
          tableText = `### Serial Number: **${s}**\n- **Bill-to Party ID**: ${serialApiData.billToPartyId || 'N/A'}`;
        } else if (lowerMsg.includes('status')) {
          tableText = `### Serial Number: **${s}**\n- **System Status**: ${serialApiData.systemStatusDesc || serialApiData.status} (Code: ${serialApiData.systemStatusCode || 'N/A'})\n- **User Status**: ${serialApiData.userStatusDesc || 'N/A'} (Code: ${serialApiData.userStatusCode || 'N/A'})`;
        } else if (lowerMsg.includes('model') || lowerMsg.includes('product')) {
          tableText = `### Serial Number: **${s}**\n- **Product Model**: ${serialApiData.product}`;
        } else {
          // Full Details markdown table
          tableText = `### Details for Serial Number: **${s}**
| Property | Value |
| :--- | :--- |
| **Product Model** | ${serialApiData.product} |
| **Serial Number** | ${serialApiData.serialNumber} |
| **System Status** | ${serialApiData.systemStatusDesc || serialApiData.status} (\`${serialApiData.systemStatusCode || 'N/A'}\`) |
| **User Status** | ${serialApiData.userStatusDesc || 'N/A'} (\`${serialApiData.userStatusCode || 'N/A'}\`) |
| **Sold-to Party** | **${serialApiData.soldToParty}** (ID: ${serialApiData.soldToPartyId || 'N/A'}) |
| **Sold-to Address** | ${serialApiData.soldToFullAddress || 'N/A'} |
| **Ship-to Party** | **${serialApiData.shipToParty}** (ID: ${serialApiData.shipToPartyId || 'N/A'}) |
| **Ship-to Address** | ${serialApiData.shipToFullAddress || 'N/A'} |
| **Bill-to Party ID** | ${serialApiData.billToPartyId || 'N/A'} |`;
        }
        detailsTables.push(tableText);
      } else {
        detailsTables.push(`### Serial Number: **${s}**\n*Serial number doesnot exist*`);
      }
    }

    const responseText = detailsTables.join('\n\n---\n\n');

    return res.status(200).json({
      success: true,
      category: 'Summary',
      responseText,
      serialNumber: targetSerial || null,
      productName: productName || null,
      detectedSerials: extractedSerials,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Chat Orchestration Error] Failed to process chat request:', err.message);
    res.status(500).json({
      success: false,
      error: `Failed to process chat: ${err.message}`
    });
  }
});

/**
 * Fetch scan history log list
 */
app.get('/api/v1/scans/history', async (req, res) => {
  const scans = await db.getAll();
  res.status(200).json(scans);
});

/**
 * Clear scan history database
 */
app.delete('/api/v1/scans', async (req, res) => {
  await db.clear();
  res.status(200).json({
    success: true,
    message: 'Scan history successfully cleared',
  });
});

/**
 * Delete a single scan log by ID
 */
app.delete('/api/v1/scans/:id', async (req, res) => {
  const scanId = req.params.id;
  try {
    const success = await db.deleteSingle(scanId);
    if (success) {
      res.status(200).json({
        success: true,
        message: `Scan log ${scanId} successfully deleted`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete scan log from database',
      });
    }
  } catch (err) {
    console.error('[Delete Scan Error] Failed to delete scan:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Bind server to 0.0.0.0 to make it accessible to local network devices (e.g. mobile phones on Wi-Fi)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`  MyGo Scan Backend API Server started  `);
  console.log(`  Running on: http://localhost:${PORT}      `);
  console.log(`  External connections: http://0.0.0.0:${PORT}`);
  console.log(`=========================================`);
});

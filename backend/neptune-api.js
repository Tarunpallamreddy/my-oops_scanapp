const user = 'CR5ORCA3OPT';
const pass = 'Qwectg$24g';
const basicAuthHeader = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
const url = 'https://dispatchq.amo-inc.com/neptune/api/getserialdetails/getSerialDetails?sap-client=050';

let cachedToken = null;
let tokenExpiresAt = 0;
let lastOAuthAttemptTime = 0;
const OAUTH_RETRY_COOLDOWN = 10 * 60 * 1000; // 10 minutes

/**
 * Retrieves an OAuth 2.0 access token using credentials.
 * Tries client_credentials first, then password grant, across possible endpoints.
 * @returns {Promise<string|null>}
 */
async function getOAuthToken() {
  // Return null immediately to bypass unsupported OAuth endpoints and fallback directly to Basic Auth
  return null;
}

/**
 * Extracts the matched row from various potential response schemas.
 */
function extractItemFromResponse(data) {
  if (!data) return null;

  let list = null;
  if (data.result && Array.isArray(data.result.GT_RESULT)) {
    list = data.result.GT_RESULT;
  } else if (Array.isArray(data.GT_RESULT)) {
    list = data.GT_RESULT;
  } else if (data.result && Array.isArray(data.result.it_sernr)) {
    list = data.result.it_sernr;
  } else if (Array.isArray(data.it_sernr)) {
    list = data.it_sernr;
  } else if (data.result && Array.isArray(data.result.IT_SERNR)) {
    list = data.result.IT_SERNR;
  } else if (Array.isArray(data.IT_SERNR)) {
    list = data.IT_SERNR;
  }

  if (list && list.length > 0) {
    return list[0];
  }
  return null;
}

/**
 * Fetches serial number details from the live SAP Neptune API.
 * @param {string} serialNumber
 * @returns {Promise<object>}
 */
async function fetchSerialDataInternal(serialNumber) {
  const serialItems = [
    { SERIAL: serialNumber }
  ];
  const padded = serialNumber.padStart(18, '0');
  if (padded !== serialNumber) {
    serialItems.push({ SERIAL: padded });
  }

  // Try multiple request payload formats
  const payloads = [
    // 1. Key-Value array table representation with GT_INPUT and SERIAL field
    [
      { KEY: "GT_INPUT", VALUE: JSON.stringify(serialItems) }
    ]
  ];

  // Try fetching token
  let token = null;
  try {
    token = await getOAuthToken();
  } catch (tokenErr) {
    console.warn('[OAuth Error] Failed to get OAuth token:', tokenErr.message);
  }

  // Construct auth configurations to attempt
  const authConfigs = [];
  if (token) {
    authConfigs.push({ name: 'OAuth Bearer', header: `Bearer ${token}` });
  }
  authConfigs.push({ name: 'Basic Authentication', header: basicAuthHeader });

  // Try each authorization mechanism and payload format combination
  for (const auth of authConfigs) {
    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      try {
        console.log(`[API Lookup] Trying ${auth.name} with payload format #${i + 1} for serial ${serialNumber}...`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': auth.header
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const data = await response.json();
          const item = extractItemFromResponse(data);
          if (item) {
            console.log(`[API Lookup Success] Serial ${serialNumber} successfully retrieved using ${auth.name} (Format #${i + 1}).`);
            return {
              serialNumber: serialNumber,
              product: item.MATNR || item.MAKTX || 'Unknown Product',
              status: item.SYS_STATUS_DESC || item.USR_STATUS_DESC || item.ASTTX || item.TXT30 || 'Unknown Status',
              soldToParty: item.SOP_NAME1 || item.SOLDTOPARTY || item.KUNAG || 'Unknown Sold-to Party',
              shipToParty: item.SH_NAME1 || item.SHIPTOPARTY || item.KUNWE || 'Unknown Ship-to Party',
              
              // Detailed fields mapping
              shipToPartyId: item.SHIPTOPARTY || null,
              shipToPostalCode: item.SH_PSTLZ || null,
              shipToCity: item.SH_ORT01 || null,
              shipToCountry: item.SH_LAND1 || null,
              shipToStreet: item.SH_STRAS || null,
              shipToFullAddress: item.SH_FULL_ADDRESS || null,
              
              soldToPartyId: item.SOLDTOPARTY || null,
              soldToPostalCode: item.SOP_PSTLZ || null,
              soldToCity: item.SOP_ORT01 || null,
              soldToCountry: item.SOP_LAND1 || null,
              soldToStreet: item.SOP_STRAS || null,
              soldToFullAddress: item.SOP_FULLADDRESS || null,
              
              billToPartyId: item.BILLTOPARTY || null,
              userStatusCode: item.USR_STATUS || null,
              userStatusDesc: item.USR_STATUS_DESC || null,
              systemStatusCode: item.SYS_STATUS || null,
              systemStatusDesc: item.SYS_STATUS_DESC || null,
              
              isRealData: true
            };
          } else {
            console.log(`[API Lookup] ${auth.name} with format #${i + 1} returned empty list.`);
          }
        } else {
          console.warn(`[API Lookup Warning] ${auth.name} format #${i + 1} failed with status ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        console.error(`[API Lookup Error] ${auth.name} format #${i + 1} exception for ${serialNumber}:`, err.message);
      }
    }
  }

  console.log(`[API Lookup Fail] Serial ${serialNumber} not found under any configuration.`);

  return {
    serialNumber: serialNumber,
    isRealData: false,
    notFound: true
  };
}

module.exports = {
  fetchSerialDataInternal,
  extractItemFromResponse
};

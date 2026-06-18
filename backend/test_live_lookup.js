const user = 'CR5ORCA3OPT';
const pass = 'Qwectg$24g';
const basicAuthHeader = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
const url = 'https://dispatchq.amo-inc.com/neptune/api/getserialdetails/getSerialDetails?sap-client=050';

async function test() {
  console.log('Fetching raw Neptune response...');
  const serialItems = [{ SERIAL: '2043052447' }];
  const payload = [{ KEY: "GT_INPUT", VALUE: JSON.stringify(serialItems) }];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': basicAuthHeader
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Raw API Response GT_RESULT:', JSON.stringify(data.result?.GT_RESULT || data.GT_RESULT || data, null, 2));
    } else {
      console.log('Error status:', response.status);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();

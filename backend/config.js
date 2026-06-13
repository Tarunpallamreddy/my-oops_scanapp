module.exports = {
  // Database configuration parameters
  // Ensure SQL Server Authentication (Mixed Mode) is enabled on your SQL Server!
  dbConfig: {
    user: 'sa', // Replace with your SQL Server username
    password: 'YourPasswordHere', // Replace with your SQL Server password
    server: 'localhost', // Server host name or IP address
    database: 'MyGoScan', // The database name in SQL Server
    port: 1433, // Default SQL Server port
    options: {
      encrypt: false, // Set to true if using Azure or encryption is enforced
      trustServerCertificate: true, // Allow self-signed certificate for local dev
      connectionTimeout: 30000,
      requestTimeout: 30000
    }
  }
};

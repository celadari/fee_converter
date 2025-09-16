# Gasolina Relay Backend

A backend API service that receives signed XDR transactions and submits them using a sponsor account, enabling sponsored transactions on the Stellar network.

## Features

- **Sponsored Transactions**: Submit transactions on behalf of users using a sponsor account
- **XDR Validation**: Validates and parses Stellar XDR transactions
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Security**: Helmet.js for security headers and CORS protection
- **Error Handling**: Comprehensive error handling with detailed responses
- **Health Checks**: Built-in health check endpoint

## Setup

1. **Install Dependencies**

   ```bash
   cd backend
   npm install
   ```

2. **Environment Configuration**

   ```bash
   cp env.example .env
   ```

   Edit `.env` with your configuration:

   ```env
   # Stellar Network Configuration
   STELLAR_NETWORK_PASSPHRASE=Standalone Network ; February 2017
   STELLAR_RPC_URL=http://localhost:8000/rpc

   # Sponsor Configuration
   SPONSOR_SECRET_KEY=your_sponsor_secret_key_here

   # Server Configuration
   PORT=3001
   NODE_ENV=development
   ```

3. **Start the Server**

   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### POST /relay

Submit a signed XDR transaction for sponsored execution.

**Request Body:**

```json
{
  "xdr": "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"
}
```

**Success Response:**

```json
{
  "success": true,
  "transactionHash": "abc123...",
  "ledger": 12345,
  "sponsor": "GABC123...",
  "submittedAt": "2024-01-01T12:00:00.000Z"
}
```

**Error Response:**

```json
{
  "error": "Transaction failed",
  "message": "Insufficient balance",
  "stellarError": { ... }
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "gasolina-relay-backend"
}
```

## How It Works

1. **Receive XDR**: The API receives a signed XDR transaction from the frontend
2. **Parse Transaction**: Validates and parses the XDR transaction
3. **Sponsor Setup**: Uses the configured sponsor account to pay for transaction fees
4. **Rebuild Transaction**: Creates a new transaction with the sponsor as the source account
5. **Submit**: Submits the transaction to the Stellar network
6. **Return Hash**: Returns the transaction hash and ledger information

## Security Considerations

- **Rate Limiting**: Prevents abuse with configurable rate limits
- **CORS**: Configured for specific origins in production
- **Helmet**: Security headers for protection against common vulnerabilities
- **Environment Variables**: Sensitive data stored in environment variables
- **Input Validation**: Validates all incoming XDR transactions

## Development

The backend is designed to work with the Stellar Scaffold frontend. Make sure to:

1. Set up your sponsor account with sufficient XLM for transaction fees
2. Configure the correct network settings for your environment
3. Update CORS settings for production deployment

## License

MIT

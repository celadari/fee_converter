# Gasolina Relay Backend Setup Guide

This guide will help you set up and run the relay backend API that receives signed XDR transactions and submits them using a sponsor account.

## 🚀 Quick Start

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp backend/env.example backend/.env

# Edit the .env file with your settings
nano backend/.env
```

**Required Environment Variables:**

```env
# Stellar Network Configuration
STELLAR_NETWORK_PASSPHRASE=Standalone Network ; February 2017
STELLAR_RPC_URL=http://localhost:8000/rpc

# Sponsor Configuration (REQUIRED)
SPONSOR_SECRET_KEY=your_sponsor_secret_key_here

# Server Configuration
PORT=3001
NODE_ENV=development
```

### 3. Set Up Your Sponsor Account

You need a Stellar account with XLM to pay for transaction fees. You can:

1. **Create a new account** using Stellar Laboratory
2. **Use an existing account** if you have one
3. **Fund the account** with XLM (use friendbot for testnet)

**Important:** The `SPONSOR_SECRET_KEY` should be the secret key of an account that has sufficient XLM to pay for transaction fees.

### 4. Start the Services

**Option A: Start both services together (recommended)**

```bash
# Install backend dependencies first (if not already done)
npm run backend:install

# Start both frontend and backend
npm run dev:full
```

**Option B: Start manually in separate terminals**

```bash
# Terminal 1 - Backend
npm run backend:dev

# Terminal 2 - Frontend
npm run dev
```

## 🔧 API Usage

### Endpoint: POST /relay

Submit a signed XDR transaction for sponsored execution.

**Request:**

```bash
curl -X POST http://localhost:3001/relay \
  -H "Content-Type: application/json" \
  -d '{
    "xdr": "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"
  }'
```

**Response:**

```json
{
  "success": true,
  "transactionHash": "abc123...",
  "ledger": 12345,
  "sponsor": "GABC123...",
  "submittedAt": "2024-01-01T12:00:00.000Z"
}
```

### Endpoint: GET /health

Check the health status of the relay backend.

**Request:**

```bash
curl http://localhost:3001/health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "gasolina-relay-backend"
}
```

## 🎨 Frontend Integration

The frontend has been updated with:

1. **Relay utility functions** (`src/util/relay.ts`)
2. **React hook** (`src/hooks/useRelay.ts`)
3. **Example component** (`src/components/RelayExample.tsx`)
4. **Navigation** - New "Relay" tab in the header

### Using the Relay in Your Code

```typescript
import { useRelay } from '../hooks/useRelay';
import { Transaction } from '@stellar/stellar-sdk';

function MyComponent() {
  const { submitTransaction, isLoading, error } = useRelay();

  const handleSubmit = async (transaction: Transaction) => {
    try {
      const response = await submitTransaction(transaction);
      console.log('Transaction hash:', response.transactionHash);
    } catch (err) {
      console.error('Failed to submit:', err);
    }
  };

  return (
    <button
      onClick={() => handleSubmit(myTransaction)}
      disabled={isLoading}
    >
      {isLoading ? 'Submitting...' : 'Submit Sponsored Transaction'}
    </button>
  );
}
```

## 🔍 Testing

1. **Start the services** using `npm run dev:full`
2. **Navigate to** http://localhost:5173/relay
3. **Click "Load Sample XDR"** to load a test transaction
4. **Click "Submit to Relay"** to test the sponsored transaction

## 🛠️ Troubleshooting

### Common Issues

1. **"Sponsor key not configured"**

   - Make sure you've created `backend/.env` with `SPONSOR_SECRET_KEY`

2. **"Insufficient balance"**

   - Your sponsor account needs XLM to pay for transaction fees
   - Use friendbot to fund your testnet account

3. **"Invalid XDR"**

   - The XDR transaction must be properly formatted and signed
   - Make sure you're using the correct network passphrase

4. **CORS errors**
   - The backend is configured to allow requests from localhost:5173
   - Check that both services are running on the correct ports

### Logs

- **Backend logs**: Check the terminal where you started the backend
- **Frontend logs**: Check the browser console
- **Network logs**: Use browser dev tools Network tab

## 🔒 Security Notes

- **Never commit** your `.env` file with real secret keys
- **Use testnet** for development and testing
- **Rate limiting** is enabled to prevent abuse
- **CORS** is configured for specific origins in production

## 📚 Next Steps

1. **Customize the relay logic** for your specific use case
2. **Add authentication** if needed
3. **Implement transaction validation** rules
4. **Add monitoring and logging**
5. **Deploy to production** with proper security measures

## 🆘 Support

If you encounter issues:

1. Check the logs for error messages
2. Verify your environment configuration
3. Ensure your sponsor account has sufficient balance
4. Test with the provided sample XDR first

Happy building! 🚀

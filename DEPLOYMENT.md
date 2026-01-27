# Vercel Deployment Guide for AniFox Watch

## Prerequisites

1. Create a Vercel account: https://vercel.com
2. Install the Vercel CLI: `npm i -g vercel`
3. Have your project ready for deployment

## Deployment Steps

### 1. Create a Vercel Project

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Deploy the project
vercel
```

### 2. Configure Environment Variables

During deployment, you may need to configure these environment variables:

```
NODE_ENV=production
CORS_ORIGIN=https://anifoxwatch.vercel.app
PORT=3001
```

### 3. Verify Deployment

After deployment, check:
- Frontend: https://anifoxwatch.vercel.app
- API endpoints: https://anifoxwatch.vercel.app/api/...

### 4. Custom Domain (Optional)

To use a custom domain:
1. Go to your Vercel dashboard
2. Select your project
3. Go to "Settings" > "Domains"
4. Add your custom domain

## Build Configuration

### Frontend Build
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Backend Build
- **Framework Preset**: Node.js
- **Build Command**: `cd server && npm install && npm run build`
- **Output Directory**: `server/dist`

## Troubleshooting

### Common Issues

1. **API Routes not working**: Ensure the `vercel.json` configuration is correct and the server is properly built
2. **CORS errors**: Check the `CORS_ORIGIN` environment variable
3. **Build failures**: Make sure all dependencies are properly installed

### Debugging

```bash
# Check deployment logs
vercel logs anifoxwatch --all

# Redeploy with debugging
vercel --debug
```

## Performance Optimization

- **CDN Caching**: Vercel automatically caches static assets
- **Edge Network**: API routes are deployed to Vercel's edge network
- **Asset Optimization**: Vite automatically optimizes static assets

## Security

- Enable HTTPS for all connections (Vercel provides free SSL certificates)
- Restrict API access using CORS configuration
- Use environment variables for sensitive information

## Monitoring

- Vercel Analytics: https://vercel.com/dashboard/analytics
- Vercel Speed Insights: https://vercel.com/dashboard/speed-insights
- Logs: Access via Vercel dashboard or CLI

## Scaling

Vercel automatically scales your application based on traffic:
- Static assets are cached globally
- API routes are serverless functions
- Auto-scaling based on load

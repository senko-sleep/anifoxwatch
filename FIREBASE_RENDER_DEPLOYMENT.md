# Firebase & Render.com Deployment Guide for AniFox

## 🚀 Deployment Overview

AniFox uses a **hybrid deployment strategy**:
- **Firebase Hosting** for the frontend (React app)
- **Render.com** for the backend API

This provides the best of both worlds: Firebase's excellent hosting with Render.com's reliable API hosting.

## 📋 Prerequisites

### For Both Platforms:
- Node.js 18+ installed
- npm installed
- Git repository set up

### For Firebase:
- Firebase CLI available via npx
- Google account with Firebase project

### For Render.com:
- Render.com account
- GitHub repository connected

---

## 🔥 Firebase Hosting Setup (Frontend)

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"**
3. **Project name**: `anifoxwatch`
4. **Project ID**: `anifoxwatch`
5. Click **"Create project"**

### 2. Initialize Firebase Hosting

```bash
# Login to Firebase
npx firebase login

# Initialize Firebase with hosting only
npx firebase init

# When prompted:
# - Choose: Hosting
# - Select your project: anifoxwatch
# - Public directory: dist
# - Single-page app: Yes
```

### 3. Configure Environment Variables

Create environment files for different environments:

#### **For Production (Firebase Hosting):**
Create `.env.production`:
```bash
VITE_API_URL=https://anifoxwatch-api.anifoxwatch.workers.dev
```

#### **For Local Development:**
Create `.env.development` (optional):
```bash
# VITE_API_URL=http://localhost:3001  # Optional - auto-detected
```

#### **Automatic Environment Detection:**
The API client automatically uses:
- **Local**: `http://localhost:3001` (development)
- **Production**: `https://anifoxwatch-api.anifoxwatch.workers.dev` (production)

---

## 🖥️ Render.com API Setup (Backend)

### 1. Deploy Backend to Render.com

1. Push this code to GitHub
2. Go to [Render.com Dashboard](https://dashboard.render.com)
3. Click **"New"** → **"Web Service"**
4. Connect your GitHub repository
5. Configure the service:
   - **Name**: `anifoxwatch`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Root Directory**: `./server`

### 2. Set Environment Variables in Render.com

Add these environment variables in your Render.com service settings:

```
API_KEY=your_actual_api_key
DATABASE_URL=your_database_url
CORS_ORIGIN=https://anifoxwatch.web.app
NODE_ENV=production
PORT=10000
```

### 3. Deploy

Render.com will automatically deploy when you push to your main branch.

Your API will be available at: `https://anifoxwatch-api.anifoxwatch.workers.dev`

---

## 🚀 Complete Deployment

### Step 1: Deploy API to Render.com

1. Push code to GitHub
2. Render.com auto-deploys the API
3. Your API will be available at: `https://anifoxwatch-api.anifoxwatch.workers.dev`

### Step 2: Update Frontend Environment

The frontend automatically uses the correct API URL:
- **Local development**: `http://localhost:3001`
- **Production**: `https://anifoxwatch-api.anifoxwatch.workers.dev`

### Step 3: Deploy Frontend to Firebase

```bash
# Build and deploy frontend
npm run build
npx firebase deploy --only hosting
```

---

## 🌐 Production URLs

After deployment:
- **Frontend**: `https://anifoxwatch.web.app`
- **Backend API**: `https://anifoxwatch-api.anifoxwatch.workers.dev`

---

## 🔧 Configuration Files

### Firebase Files:
- `firebase.json` - Firebase project configuration
- `.firebaserc` - Firebase project settings
- `functions/` - Firebase Cloud Functions backend

### Render.com Files:
- `render.yaml` - Render.com service configuration

### Environment Files:
- `.env.firebase` - Firebase environment variables template
- `.env.render` - Render.com environment variables template

---

## 🛠️ Development & Testing

### Local Firebase Testing:
```bash
# Start Firebase emulators
npm run firebase:emulators

# Serve locally
npm run firebase:serve
```

### Local Development:
```bash
# Start both frontend and backend
npm run dev:all

# Start only frontend
npm run dev:client

# Start only backend
npm run dev:api
```

---

## 🔄 Switching Between Platforms

The application is designed to work with both platforms. To switch:

1. **Update API base URL** in `src/lib/api-client.ts`
2. **Update CORS origins** in environment variables
3. **Deploy to the new platform** using the appropriate commands

---

## 📊 Monitoring & Maintenance

### Firebase:
- Use Firebase Console for logs and monitoring
- Set up Firebase Crashlytics for error reporting
- Monitor function performance and usage

### Render.com:
- Use Render.com dashboard for logs and metrics
- Set up health checks and alerts
- Monitor service performance and scaling

---

## 🆘 Troubleshooting

### Common Firebase Issues:
- **Functions timeout**: Increase timeout in `firebase.json`
- **CORS errors**: Check CORS configuration in Firebase Functions
- **Build failures**: Ensure all dependencies are listed in `functions/package.json`

### Common Render.com Issues:
- **Build timeouts**: Increase build timeout in service settings
- **Memory issues**: Upgrade service plan or optimize code
- **Environment variables**: Ensure all required variables are set

---

## 📝 Deployment Checklist

- [ ] Firebase project created
- [ ] Firebase CLI installed and configured
- [ ] Environment variables set
- [ ] Frontend built successfully
- [ ] Backend functions deployed
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Monitoring and alerts set up

---

## 🎯 Performance Optimization

### Firebase Optimization:
- Use Firebase CDN for static assets
- Implement caching strategies
- Monitor function cold starts

### Render.com Optimization:
- Use appropriate service plans
- Implement caching headers
- Monitor resource usage

---

## 🔒 Security Considerations

- Store sensitive data in environment variables
- Use Firebase Security Rules (if using Firestore)
- Implement proper CORS policies
- Regular security updates and monitoring
- Use HTTPS for all communications

---

Happy deploying! 🚀

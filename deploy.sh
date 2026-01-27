#!/bin/bash

# Deployment script for AniFox - Firebase & Render.com
# Usage: ./deploy.sh [firebase|render|all]

set -e

echo "🚀 AniFox Deployment Script"
echo "==========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_info "Checking dependencies..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi

    print_status "Dependencies check passed"
}

# Deploy to Firebase
deploy_firebase() {
    print_info "Deploying to Firebase..."

    # Check if Firebase CLI is available via npx
    if ! npx firebase --version &> /dev/null; then
        print_error "Firebase CLI is not available. Install with: npm install -g firebase-tools"
        exit 1
    fi

    # Build the frontend
    print_info "Building frontend..."
    npm run build

    # Install Firebase Functions dependencies
    print_info "Installing Firebase Functions dependencies..."
    npm run build:functions

    # Deploy to Firebase
    print_info "Deploying to Firebase (Hosting + Functions)..."
    npx firebase deploy

    print_status "Firebase deployment completed!"
}

# Deploy to Render.com
deploy_render() {
    print_info "Deploying to Render.com..."

    # Check if Render CLI is installed
    if ! command -v render &> /dev/null; then
        print_warning "Render CLI not found. Make sure to connect your GitHub repo to Render.com dashboard"
        print_info "For manual deployment:"
        print_info "1. Push this code to GitHub"
        print_info "2. Connect your GitHub repo to Render.com"
        print_info "3. Use the render.yaml configuration file"
        return
    fi

    # Deploy using render.yaml
    render deploy

    print_status "Render.com deployment initiated!"
}

# Main deployment logic
main() {
    local target="${1:-all}"

    check_dependencies

    case "$target" in
        "firebase")
            deploy_firebase
            ;;
        "render")
            deploy_render
            ;;
        "all")
            print_info "Deploying to all platforms..."
            deploy_firebase
            echo ""
            deploy_render
            ;;
        *)
            print_error "Invalid target: $target"
            echo "Usage: $0 [firebase|render|all]"
            exit 1
            ;;
    esac

    print_status "Deployment completed successfully!"
    print_info "Don't forget to:"
    print_info "- Update your DNS settings if needed"
    print_info "- Configure environment variables in the dashboard"
    print_info "- Set up monitoring and alerts"
}

# Run main function with all arguments
main "$@"

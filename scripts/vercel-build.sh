#!/bin/bash
set -e

# Vercel should have Git LFS pre-installed
# Initialize and pull LFS files
echo "Checking Git LFS..."
if command -v git-lfs &> /dev/null; then
  echo "Git LFS found, version:"
  git lfs version
  echo "Initializing Git LFS..."
  git lfs install --skip-repo
  echo "Pulling LFS files..."
  git lfs pull
  echo "Verifying LFS files..."
  git lfs ls-files | head -5
  echo "LFS files pulled successfully"
else
  echo "ERROR: Git LFS not available!"
  echo "This may cause issues with large JSON files."
  exit 1
fi

# Run the build
echo "Starting build..."
npm run build


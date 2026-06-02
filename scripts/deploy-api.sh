#!/bin/bash

# ==============================================================================
# Script Build và Push Docker Image lên AWS ECR
# Chạy script này tại thư mục GỐC (root) của dự án.
# ==============================================================================

set -e # Dừng nếu có lỗi

REGION="ap-southeast-1" # Thay đổi nếu bạn dùng region khác
PROJECT_NAME="urban-chat-api"
REPO_NAME="${PROJECT_NAME}-repo"

# Lấy AWS Account ID tự động
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"
IMAGE_TAG="latest" # Có thể đổi thành Git Commit SHA nếu muốn versioning

echo "1. Đang đăng nhập vào AWS ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo "2. Đang Build Docker image cho API..."
# Chạy build từ thư mục gốc của monorepo
docker build -t $REPO_NAME -f apps/api/Dockerfile .

echo "3. Đang Tag Docker image..."
docker tag ${REPO_NAME}:latest ${ECR_URI}:${IMAGE_TAG}

echo "4. Đang Push Docker image lên ECR..."
docker push ${ECR_URI}:${IMAGE_TAG}

echo "=========================================="
echo "✅ Đã đẩy Image lên ECR thành công!"
echo "URI của Image: ${ECR_URI}:${IMAGE_TAG}"
echo "=========================================="

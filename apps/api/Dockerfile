# Hướng dẫn build:
# Phải chạy command build từ thư mục gốc (root) của monorepo:
# docker build -t api-server -f apps/api/Dockerfile .

FROM node:22-alpine AS builder

# Thiết lập thư mục làm việc
WORKDIR /app

# Bật và chuẩn bị pnpm theo đúng version trong package.json
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

# Copy cấu hình root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy thư mục scripts (cần thiết cho postinstall hooks)
COPY scripts ./scripts

# Copy các packages dùng chung và thư mục app api
COPY packages ./packages
COPY apps/api ./apps/api

# Cài đặt toàn bộ dependencies trong monorepo (cả devDependencies để build)
RUN pnpm install --frozen-lockfile

# Build API app (nếu có package nào phụ thuộc, pnpm sẽ tự build nhờ turbo/pnpm)
RUN pnpm --filter api build

# Sử dụng pnpm deploy để tách riêng app api và các dependencies của nó cho production
# Tính năng này giúp loại bỏ devDependencies và các package không liên quan, làm nhẹ image
RUN pnpm deploy --legacy --filter api --prod /app/deploy

# -------------------------
# Production image
# -------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Đặt biến môi trường production
ENV NODE_ENV=production

# Copy file từ bước builder sang
# Lưu ý: pnpm deploy sẽ bỏ qua thư mục dist do nó nằm trong .gitignore, nên ta copy trực tiếp từ apps/api
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/deploy/package.json ./package.json

# Mở port 3000 (Port mặc định của NestJS)
EXPOSE 3000

# Khởi chạy ứng dụng
CMD ["node", "dist/src/main"]

# Base Stage for Dependencies
FROM node:22-slim AS base
WORKDIR /app

# Install system dependencies (Python for data analysis)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Python libraries
RUN pip3 install --no-cache-dir --break-system-packages \
    pandas \
    numpy \
    matplotlib \
    seaborn \
    openpyxl \
    scipy \
    plotly

# Build Stage
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Ensure API_KEY and DATABASE_URL are available for some build-time checks if needed
ARG API_KEY
ARG DATABASE_URL
ENV API_KEY=$API_KEY
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

# Production Stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src/services/metadata.py ./src/services/metadata.py
COPY --from=builder /app/src/services/kernel_bridge.py ./src/services/kernel_bridge.py
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose Next.js default port
EXPOSE 3000

CMD ["npm", "start"]

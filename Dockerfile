# Use official Node.js image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Set timezone
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Kolkata /etc/localtime && \
    echo "Asia/Kolkata" > /etc/timezone

# Add this line after WORKDIR
RUN mkdir -p logs

# Copy package files
COPY package*.json ./

# Install dependencies with explicit registry and increased timeout
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set timeout 60000 && \
    npm install

# Bundle app source
COPY . .

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the app with increased Node memory and keep-alive
CMD ["node", "--max-old-space-size=2048", "src/app.js"]
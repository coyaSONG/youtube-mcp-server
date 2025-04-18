# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
FROM node:lts-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# Copy the rest of the source code
COPY . .

# Build the project
RUN npm run build

# Run the MCP server directly
CMD [ "node", "dist/index.js" ]

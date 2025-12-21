# Use a specific Node.js version to match Northflank's environment
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Copy dependency definitions
# We copy package.json only first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies
# Using 'npm install' here is safer for Docker builds than 'npm ci' 
# if you are having lockfile sync issues.
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Your app binds to port 8080 by default (check your bin/www or app.js)
EXPOSE 8080

# Start the application
CMD [ "npm", "start" ]

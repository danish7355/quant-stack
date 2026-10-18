FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (including devDependencies required for build)
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Vite frontend and compile the server
RUN npm run build

# Expose port 3000 (Render will inject process.env.PORT at runtime)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

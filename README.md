# Minecraft Bedrock Server Updater

A Node.js application that automatically checks for, downloads, and installs updates for Minecraft Bedrock Server.

## Features

- Automatically checks for new Minecraft Bedrock Server versions
- Downloads and installs updates when available
- Handles service restart during updates
- Logs all operations for troubleshooting

## Installation

```bash
# Clone the repository
git clone https://github.com/jferg368/bedrock-updater.git
cd bedrock-updater

# Install dependencies
npm install

# Make it globally available (optional)
npm link
```

## Usage

### As a command-line tool

If installed globally:

```bash
bedrock-updater
```

Or run directly:

```bash
npm start
```

### As a scheduled task

Add to crontab to run periodically:

```bash
# Example: Check for updates every day at 3 AM
0 3 * * * /usr/bin/node /path/to/bedrock-updater/src/index.js >> /var/log/bedrock-updater.log 2>&1
```

## Configuration

The script uses the following paths by default, which can be overridden with environment variables:

| Environment Variable | Default Value | Description |
|---------------------|---------------|-------------|
| VERSION_FILE | /tmp/minecraft_bedrock_version.txt | Path to file tracking the current version |
| LOG_FILE | /var/log/bedrock-updater.log | Path to log file |
| SERVER_PATH | /opt/minecraft/bedrock_server | Path to the Bedrock server executable |
| SERVICE_NAME | minecraft.service | Name of the systemd service |

Example with custom configuration:

```bash
VERSION_FILE=/var/minecraft/version.txt SERVER_PATH=/usr/local/bin/bedrock_server npm start
```

## Requirements

- Node.js 14 or higher
- Puppeteer dependencies (for headless browser)
- systemd (for service management)
- curl and unzip commands

## License

ISC

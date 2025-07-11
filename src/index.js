import puppeteer from 'puppeteer';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// Default configuration
const config = {
  versionFile: process.env.VERSION_FILE || '/tmp/minecraft_bedrock_version.txt',
  logFile: process.env.LOG_FILE || '/var/log/bedrock-updater.log',
  serverPath: process.env.SERVER_PATH || '/opt/minecraft/bedrock_server',
  serviceName: process.env.SERVICE_NAME || 'minecraft.service'
};

const VERSION_FILE = config.versionFile;
const LOG_FILE = config.logFile;

// Function to log messages to both console and log file
function log(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  try {
    // Ensure log directory exists
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (dirError) {
        console.error(`Could not create log directory: ${dirError.message}`);
      }
    }
    
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  } catch (error) {
    console.error(`Could not write to log file: ${error.message}`);
  }
}

// Function to execute commands and log output
async function execAndLog(command) {
  log(`Executing: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) log(`Output: ${stdout}`);
    if (stderr) log(`Error: ${stderr}`);
    return { stdout, stderr };
  } catch (error) {
    log(`Command failed: ${error.message}`);
    if (error.stdout) log(`Output: ${error.stdout}`);
    if (error.stderr) log(`Error: ${error.stderr}`);
    throw error;
  }
}

// Function to read the current version from the version file
async function getCurrentVersion() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const version = await fs.promises.readFile(VERSION_FILE, 'utf8');
      log(`Read current version from ${VERSION_FILE}: ${version.trim()}`);
      return version.trim();
    } else {
      log(`Version file ${VERSION_FILE} does not exist yet`);
    }
  } catch (error) {
    log(`Error reading version file: ${error.message}`);
  }
  return null;
}

// Function to save the new version to the version file
async function saveVersion(version) {
  try {
    await fs.promises.writeFile(VERSION_FILE, version);
    log(`Saved new version to ${VERSION_FILE}: ${version}`);
    
    // Verify the file was written correctly
    const savedVersion = await getCurrentVersion();
    if (savedVersion === version) {
      log(`Version file verified: ${savedVersion}`);
    } else {
      log(`Warning: Version file verification failed. Expected: ${version}, Got: ${savedVersion || 'nothing'}`);
    }
  } catch (error) {
    log(`Error saving version file: ${error.message}`);
  }
}

export async function updateMinecraftServer() {
  log("Starting Minecraft Bedrock server update process");
  log("----------------------------------------");
  
  // Ensure the version file directory exists
  const versionFileDir = path.dirname(VERSION_FILE);
  try {
    if (!fs.existsSync(versionFileDir)) {
      log(`Creating directory for version file: ${versionFileDir}`);
      fs.mkdirSync(versionFileDir, { recursive: true });
    }
  } catch (error) {
    log(`Warning: Could not ensure version file directory exists: ${error.message}`);
  }

  // Launch the browser with no-sandbox option
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36');

    // Navigate to the page
    log("Navigating to Minecraft Bedrock server download page...");
    await page.goto('https://www.minecraft.net/en-us/download/server/bedrock', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for the radio buttons to load
    await page.waitForSelector('input[type="radio"]', { timeout: 10000 });

    // Find and click the Linux/Ubuntu radio button
    log("Selecting Linux/Ubuntu option...");
    const radioButtons = await page.$$('input[type="radio"]');
    let linuxRadioFound = false;

    for (const radioButton of radioButtons) {
      const value = await radioButton.evaluate(el => el.value);
      if (value && value.toLowerCase().includes('linux')) {
        await radioButton.click();
        linuxRadioFound = true;
        break;
      }
    }

    if (!linuxRadioFound) {
      log("Could not find Linux radio button. Trying to find by label text...");
      const labels = await page.$$('label');
      for (const label of labels) {
        const text = await label.evaluate(el => el.textContent);
        if (text && (text.toLowerCase().includes('linux') || text.toLowerCase().includes('ubuntu'))) {
          await label.click();
          linuxRadioFound = true;
          break;
        }
      }
    }

    if (!linuxRadioFound) {
      throw new Error("Could not find Linux/Ubuntu option");
    }

    // Find and click the agreement checkbox
    log("Accepting the EULA and Privacy Policy...");
    const checkboxes = await page.$$('input[type="checkbox"]');
    let checkboxFound = false;

    for (const checkbox of checkboxes) {
      await checkbox.click();
      checkboxFound = true;
      break;
    }

    if (!checkboxFound) {
      throw new Error("Could not find agreement checkbox");
    }

    // Wait for the download button to be enabled
    await page.waitForSelector('a[href*="bedrockdedicatedserver/bin-linux/bedrock-server-"]', { timeout: 10000 });

    // Get the download link
    const downloadLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*="bedrockdedicatedserver/bin-linux/bedrock-server-"]');
      return link ? link.href : null;
    });

    if (downloadLink) {
      log("Current Bedrock server download link:");
      log(downloadLink);

      // Extract filename from URL
      const filename = path.basename(downloadLink);

      // Check if this version is already installed - BEFORE stopping the service
      const currentVersion = await getCurrentVersion();
      
      log(`Available version: ${filename}`);
      log(`Current installed version: ${currentVersion || 'unknown'}`);
      
      if (currentVersion && currentVersion === filename) {
        log(`Current version (${currentVersion}) is already the latest. No update needed.`);
        return 0; // Exit with success code - no update needed
      }

      log(`New version found: ${filename} (current: ${currentVersion || 'unknown'})`);
      const downloadPath = `/tmp/${filename}`;

      log(`Downloading to ${downloadPath}...`);

      // Download the file using curl
      try {
        await execAndLog(`curl -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36" "${downloadLink}" -o "${downloadPath}"`);
        log(`Download complete! File saved to: ${downloadPath}`);

        // Create an extraction directory
        const extractDir = `/tmp/minecraft_extract_${Date.now()}`;
        await execAndLog(`mkdir -p ${extractDir}`);

        // Unzip the downloaded file
        log(`Extracting zip file to ${extractDir}...`);
        await execAndLog(`unzip -q "${downloadPath}" -d "${extractDir}"`);

        // Check if bedrock_server exists in the extracted files
        if (fs.existsSync(`${extractDir}/bedrock_server`)) {
          log("Found bedrock_server executable in the extracted files");

          // Stop the Minecraft service before replacing the executable
          log(`Stopping ${config.serviceName}...`);
          await execAndLog(`systemctl stop ${config.serviceName}`);

          try {
            // Replace the existing server executable
            log(`Replacing ${config.serverPath} with the new version...`);
            await execAndLog(`cp "${extractDir}/bedrock_server" ${config.serverPath}`);
            await execAndLog(`chmod +x ${config.serverPath}`);

            // Start the Minecraft service after replacing the executable
            log(`Starting ${config.serviceName}...`);
            await execAndLog(`systemctl start ${config.serviceName}`);

            // Save the new version to the version file AFTER successful update
            log(`Updating version file to record successful update to: ${filename}`);
            await saveVersion(filename);

            log("Update completed successfully!");
          } catch (updateError) {
            log(`Error during update: ${updateError.message}`);

            // Attempt to start the service in case of failure
            try {
              log(`Attempting to restart ${config.serviceName} after error...`);
              await execAndLog(`systemctl start ${config.serviceName}`);
            } catch (restartError) {
              log(`Failed to restart service: ${restartError.message}`);
            }

            throw updateError;
          }
        } else {
          throw new Error("bedrock_server executable not found in the extracted files");
        }

        // Clean up
        log("Cleaning up temporary files...");
        await execAndLog(`rm -rf "${extractDir}" "${downloadPath}"`);
        
        return 0; // Success

      } catch (processError) {
        log(`Process failed: ${processError.message}`);
        throw processError;
      }
    } else {
      throw new Error("Download link not found");
    }
  } catch (error) {
    log(`Error: ${error.message}`);
    return 1; // Error exit code
  } finally {
    await browser.close();
    log("Browser closed. Script execution complete.");
    log("----------------------------------------");
    log("Minecraft Bedrock server update process finished");
  }
}

// If this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  updateMinecraftServer()
    .then(exitCode => {
      process.exit(exitCode);
    })
    .catch(error => {
      log(`Unhandled error: ${error.message}`);
      process.exit(1);
    });
}

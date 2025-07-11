#!/usr/bin/env node

import { updateMinecraftServer } from '../src/index.js';

updateMinecraftServer()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });

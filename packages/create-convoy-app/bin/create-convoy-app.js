#!/usr/bin/env node
import { main } from '../dist/index.js';
main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

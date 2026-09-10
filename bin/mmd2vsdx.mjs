#!/usr/bin/env node
// CLI 入口：转发到编译产物（npm run build 之后可用）
import { main } from '../dist/cli/index.js';

await main();

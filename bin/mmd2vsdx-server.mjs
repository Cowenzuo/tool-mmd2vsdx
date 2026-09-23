#!/usr/bin/env node
// 服务启动器：转发到编译产物；参数与生命周期见 docs/接口协议.md 第 2 节和第 8 节
import { main } from '../dist/server/index.js';

await main();

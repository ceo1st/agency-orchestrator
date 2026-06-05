/**
 * 自我升级（ao upgrade）纯函数测试
 * 只测可离线验证的逻辑：semver 比较 + 包管理器命令推断。
 * 网络拉取 / execSync 属副作用，不在单测范围。
 */
import { isNewer, detectUpgradeCommand, PKG } from '../src/utils/version-check.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

console.log('\n=== Upgrade helpers ===');

// isNewer
test('isNewer: 主版本更高', () => assert(isNewer('1.0.0', '0.9.9'), '1.0.0 > 0.9.9'));
test('isNewer: 补丁版本更高', () => assert(isNewer('0.6.18', '0.6.17'), '0.6.18 > 0.6.17'));
test('isNewer: 相等返回 false', () => assert(!isNewer('0.6.17', '0.6.17'), '相等不算更新'));
test('isNewer: 更低返回 false', () => assert(!isNewer('0.6.16', '0.6.17'), '0.6.16 < 0.6.17'));
test('isNewer: 段数不同（更长更新）', () => assert(isNewer('1.2.1', '1.2'), '1.2.1 > 1.2'));
// 注：isNewer 是朴素逐段比较，不实现 semver 预发布语义（1.2.0-1 被当作 [1,2,0,1]）

const spec = `${PKG}@1.2.3`;

// detectUpgradeCommand — 路径推断
test('detect: 默认 npm', () => {
  const cmd = detectUpgradeCommand(spec, '/usr/local/lib/node_modules/agency-orchestrator/dist/cli.js', {});
  assert(cmd === `npm i -g ${spec}`, `应为 npm，实际: ${cmd}`);
});
test('detect: pnpm 全局路径', () => {
  const cmd = detectUpgradeCommand(spec, '/Users/x/Library/pnpm/global/5/.pnpm/agency-orchestrator/dist/cli.js', {});
  assert(cmd === `pnpm add -g ${spec}`, `应为 pnpm，实际: ${cmd}`);
});
test('detect: bun 路径', () => {
  const cmd = detectUpgradeCommand(spec, '/Users/x/.bun/install/global/node_modules/agency-orchestrator/dist/cli.js', {});
  assert(cmd === `bun add -g ${spec}`, `应为 bun，实际: ${cmd}`);
});
test('detect: yarn 全局路径', () => {
  const cmd = detectUpgradeCommand(spec, '/Users/x/.yarn/global/node_modules/agency-orchestrator/dist/cli.js', {});
  assert(cmd === `yarn global add ${spec}`, `应为 yarn，实际: ${cmd}`);
});
test('detect: Windows 反斜杠路径归一化', () => {
  const cmd = detectUpgradeCommand(spec, 'C:\\Users\\x\\AppData\\Local\\pnpm\\global\\agency-orchestrator\\cli.js', {});
  assert(cmd === `pnpm add -g ${spec}`, `应为 pnpm，实际: ${cmd}`);
});
test('detect: AO_UPGRADE_CMD 覆盖一切', () => {
  const cmd = detectUpgradeCommand(spec, '/Users/x/.bun/install/agency-orchestrator/cli.js', { AO_UPGRADE_CMD: 'my-custom upgrade' });
  assert(cmd === 'my-custom upgrade', `应被环境变量覆盖，实际: ${cmd}`);
});

// 结果
console.log('\n' + '='.repeat(50));
console.log(`  Upgrade 测试: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`);
if (failed === 0) console.log('  全部通过!');
else process.exit(1);
console.log('='.repeat(50) + '\n');

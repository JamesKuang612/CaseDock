import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skillRoot = resolve(root, 'skills/casedock-testing');
const scriptTarget = resolve(skillRoot, 'scripts/casedock.mjs');
const uiTarget = resolve(skillRoot, 'assets/ui');

/** 将源码构建产物装配进 Skill，确保用户只复制一个目录即可运行。 */
async function packageSkill() {
  await rm(resolve(skillRoot, 'scripts'), { recursive: true, force: true });
  await rm(uiTarget, { recursive: true, force: true });
  await mkdir(resolve(skillRoot, 'scripts'), { recursive: true });
  await mkdir(resolve(skillRoot, 'assets'), { recursive: true });
  await cp(resolve(root, 'build/casedock.mjs'), scriptTarget);
  await cp(resolve(root, 'build/ui'), uiTarget, { recursive: true });
  await cp(resolve(root, 'LICENSE'), resolve(skillRoot, 'LICENSE.txt'));
  console.log(`CaseDock Skill 已生成：${skillRoot}`);
}

await packageSkill();

// 教学用的人为故障，不是扩展的生产代码。
// 在项目根目录运行：node teach/labs/delta-exercise.mjs
// 目标：先看到失败，再只修改 joinDeltas，保留下面的断言。
import assert from "node:assert/strict";

export function joinDeltas(deltas) {
  let answer = "";
  for (const delta of deltas) {
    answer = delta; // TODO：第 k 次后，answer 应等于前 k 段的拼接。
  }
  return answer;
}

assert.equal(joinDeltas(["Hello"]), "Hello");
console.log("✓ 单段测试通过。这还不能证明累加正确。");
assert.equal(joinDeltas(["Hello", " world"]), "Hello world", "两段输入暴露了覆盖问题；请修复 joinDeltas。");
console.log("✓ 多段测试通过。请再补空数组、空片段和中文用例。");

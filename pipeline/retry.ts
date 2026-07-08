// Haiku 偶尔会把结构化输出里的某个数组字段编码错(变成字符串/截断的JSON),
// 概率不算低。与其每次都要人工重新触发整条 GitHub Actions 流水线,
// 不如让流水线自己在结构校验失败时重试几次 —— 每次是全新的一次API调用,
// 结构错误大概率不会连续发生。
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  label = "operation"
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[retry] ${label} 第${attempt}/${maxAttempts}次尝试失败: ${(err as Error).message}`);
      if (attempt < maxAttempts) {
        console.log(`[retry] ${label} 准备重试...`);
      }
    }
  }
  throw lastError;
}

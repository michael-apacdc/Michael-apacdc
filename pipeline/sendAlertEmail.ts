// 用 Resend 的 REST 接口发预警邮件(免费额度每天100封,足够)。
// 需要两个环境变量:RESEND_API_KEY、ALERT_EMAIL_TO。没配置就静默跳过,不影响流水线其余部分。
// 未验证自有域名时,发件人必须用 Resend 提供的 onboarding@resend.dev,
// 且只能发给注册 Resend 账号用的那个邮箱 —— 收自己的预警正好够用。

import type { PortfolioSignalInput } from "./synthesizePortfolio";

const ACTION_LABELS: Record<string, string> = {
  add: "建议加仓",
  trim: "建议减仓",
  sell: "建议卖出",
  watch: "关注",
  hold: "持有",
};

export async function sendAlertEmail(
  reportDate: string,
  alerts: PortfolioSignalInput[],
  commentaryMd: string,
  siteUrl: string | null
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !to) {
    console.log("[sendAlertEmail] 未配置 RESEND_API_KEY / ALERT_EMAIL_TO,跳过邮件通知");
    return false;
  }
  if (alerts.length === 0) {
    console.log("[sendAlertEmail] 今日无预警信号,不发邮件");
    return false;
  }

  const rows = alerts
    .map((a) => {
      const label = ACTION_LABELS[a.decision.action] ?? a.decision.action;
      const reasons = a.decision.reasons.join(";");
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold">${a.ticker}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${label}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${a.indicators.price?.toFixed(2) ?? "N/A"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${reasons}</td>
      </tr>`;
    })
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto">
    <h2 style="margin-bottom:4px">持仓量化预警 · ${reportDate}</h2>
    <p style="color:#666;margin-top:0">今日共 ${alerts.length} 支持仓触发买卖/风险信号(程序按固定规则判断,非AI):</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;color:#888">
        <th style="padding:6px 10px">代码</th><th style="padding:6px 10px">信号</th><th style="padding:6px 10px">现价</th><th style="padding:6px 10px">原因</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h3 style="margin-bottom:4px">Claude 点评</h3>
    <p style="white-space:pre-wrap;font-size:14px;color:#333">${commentaryMd}</p>
    ${siteUrl ? `<p><a href="${siteUrl}/portfolio">查看完整持仓页 →</a></p>` : ""}
    <p style="color:#999;font-size:12px">量化规则输出+研究参考,不构成正式投资建议。回测未计交易成本,历史表现不代表未来收益。</p>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "持仓预警 <onboarding@resend.dev>",
      to: [to],
      subject: `[持仓预警] ${reportDate} · ${alerts.length}支持仓触发信号`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[sendAlertEmail] Resend 发送失败: HTTP ${res.status} ${body.slice(0, 300)}`);
    return false;
  }
  console.log(`[sendAlertEmail] 预警邮件已发送到 ${to}`);
  return true;
}

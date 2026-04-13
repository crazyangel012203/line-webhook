const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GAS_WEBAPP_URL = (process.env.GAS_WEBAPP_URL || "").trim();
const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

/**
 * 權限名單設定
 * 之後你只要改這裡就好
 */
const SUPERVISORS = [
  "林傳峰",
  "飯小靜"
];

const BOSSES = [
  "林傳峰",
];

/**
 * 權限判斷
 * role = supervisor / boss
 */
function hasPermission(role, displayName) {
  const name = String(displayName || "").trim();

  if (role === "supervisor") {
    return SUPERVISORS.some(x => name.includes(x));
  }

  if (role === "boss") {
    return BOSSES.some(x => name.includes(x));
  }

  return false;
}

  if (role === "boss") {
    return BOSSES.includes(displayName);
  }

  return false;
}

// 健康檢查
app.get("/", (req, res) => {
  res.status(200).send("LINE webhook server running");
});

// LINE webhook
app.post("/webhook", async (req, res) => {
  // 先立即回 LINE，避免 timeout
  res.status(200).send("OK");

  try {
    const body = req.body;
    console.log("Webhook body:", JSON.stringify(body));

    if (!body.events || !Array.isArray(body.events)) {
      return;
    }

    for (const event of body.events) {
      console.log("Event:", JSON.stringify(event));

      // 一般文字訊息
      if (event.type === "message" && event.message?.type === "text") {
        await replyText(event.replyToken, `你剛剛說：${event.message.text}`);
        continue;
      }

      // 按鈕 postback
      if (event.type === "postback") {
        let data = {};

        try {
          data = JSON.parse(event.postback.data || "{}");
        } catch (err) {
          console.error("postback parse error:", err);
          await replyText(event.replyToken, "❌ 按鈕資料錯誤");
          continue;
        }

        console.log("Parsed postback data:", JSON.stringify(data));

        const row = Number(data.row || 0);
        const action = String(data.action || "").trim();
        const role = String(data.role || "").trim().toLowerCase();

        console.log("row:", row, "action:", action, "role:", role);

        if (!row || !action) {
          await replyText(event.replyToken, "❌ 缺少必要資料");
          continue;
        }

        if (!GAS_WEBAPP_URL) {
          console.error("GAS_WEBAPP_URL is empty");
          await replyText(event.replyToken, "❌ GAS_WEBAPP_URL 未設定");
          continue;
        }

        // 取得按按鈕的人名
        let displayName = "未知";
        const profile = await getProfile(event);
        displayName = profile.displayName || "未知";

        console.log("displayName:", displayName);
        console.log("GAS_WEBAPP_URL:", GAS_WEBAPP_URL);

        // 權限判斷
        const allowed = hasPermission(role, displayName);

        if (!allowed) {
          await replyText(event.replyToken, `❌ ${displayName} 沒有此操作權限`);
          continue;
        }

        let gasUrl = "";

        if (action === "review") {
          gasUrl =
            `${GAS_WEBAPP_URL}?row=${row}` +
            `&action=review` +
            `&role=${encodeURIComponent(role)}` +
            `&name=${encodeURIComponent(displayName)}`;
        }

        if (action === "done") {
          gasUrl =
            `${GAS_WEBAPP_URL}?row=${row}` +
            `&action=done` +
            `&role=${encodeURIComponent(role)}` +
            `&name=${encodeURIComponent(displayName)}`;
        }

        console.log("gasUrl:", gasUrl);

        if (gasUrl) {
          try {
            const gasResp = await fetch(gasUrl, { method: "GET" });
            const gasText = await gasResp.text();

            console.log("GAS status:", gasResp.status);
            console.log("GAS response:", gasText);
          } catch (fetchErr) {
            console.error("Fetch GAS error:", fetchErr);
            await replyText(event.replyToken, "❌ 系統連線失敗");
          }
        }

        continue;
      }
    }
  } catch (err) {
    console.error("webhook error:", err);
  }
});

/**
 * 取得使用者名稱
 * 群組中：用 group member profile
 * 一對一：用 user profile
 */
async function getProfile(event) {
  try {
    const source = event.source || {};
    const userId = source.userId || "";

    if (!userId) return {};

    let url = "";

    if (source.type === "group" && source.groupId) {
      url = `https://api.line.me/v2/bot/group/${source.groupId}/member/${userId}`;
    } else {
      url = `https://api.line.me/v2/bot/profile/${userId}`;
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    const text = await resp.text();
    console.log("Profile raw response:", text);

    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  } catch (err) {
    console.error("getProfile error:", err);
    return {};
  }
}

/**
 * 回覆單則文字訊息
 */
async function replyText(replyToken, text) {
  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: "text",
            text
          }
        ]
      })
    });

    const result = await resp.text();
    console.log("LINE reply:", result);
  } catch (err) {
    console.error("replyText error:", err);
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GAS_WEBAPP_URL = (process.env.GAS_WEBAPP_URL || "").trim();
const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

/**
 * 🔥 用 userId 控權限（之後只改這裡）
 */

// 👉 主管
const SUPERVISORS = [
  "U1cb929477a940c15a579c794ab40dc32", // 林傳峰
  "Ud766b544d2af8c0648450562653dde2c"  // 飯小靜
];

// 👉 老闆
const BOSSES = [
  "Uxxxxxxxxxxxxx"  // 老闆
];

/**
 * 權限判斷（用 userId）
 */
function hasPermission(role, userId) {
  if (role === "supervisor") {
    return SUPERVISORS.includes(userId);
  }

  if (role === "boss") {
    return BOSSES.includes(userId);
  }

  return false;
}

// 健康檢查
app.get("/", (req, res) => {
  res.status(200).send("LINE webhook server running");
});

// LINE webhook
app.post("/webhook", async (req, res) => {
  // 🔥 先回 OK（避免 timeout）
  res.status(200).send("OK");

  try {
    const body = req.body;

    if (!body.events || !Array.isArray(body.events)) {
      return;
    }

    for (const event of body.events) {

      // 👉 抓 userId（重點🔥）
      const userId = event.source?.userId || "";
      console.log("👉 userId:", userId);

      // 👉 取得名稱
      let displayName = "未知";
      const profile = await getProfile(event);
      displayName = profile.displayName || "未知";

      console.log("👉 displayName:", displayName);

      // 👉 按鈕處理
      if (event.type === "postback") {

        let data = {};

        try {
          data = JSON.parse(event.postback.data || "{}");
        } catch (err) {
          await replyText(event.replyToken, "❌ 按鈕資料錯誤");
          continue;
        }

        const row = Number(data.row || 0);
        const action = String(data.action || "").trim();
        const role = String(data.role || "").trim().toLowerCase();

        if (!row || !action) {
          await replyText(event.replyToken, "❌ 缺少必要資料");
          continue;
        }

        // 🔥 權限判斷（用 userId）
        const allowed = hasPermission(role, userId);

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

        console.log("👉 gasUrl:", gasUrl);

        if (gasUrl) {
          try {
            await fetch(gasUrl);
          } catch (err) {
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
 * 🔥 抓名稱（支援群組）
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

    return await resp.json();

  } catch (err) {
    console.error("getProfile error:", err);
    return {};
  }
}

/**
 * 回覆訊息
 */
async function replyText(replyToken, text) {
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
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

  } catch (err) {
    console.error("replyText error:", err);
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

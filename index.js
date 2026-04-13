const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GAS_WEBAPP_URL = (process.env.GAS_WEBAPP_URL || "").trim();
const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

const SUPERVISORS = [
  "U1cb929477a940c15a579c794ab40dc32", // 林傳峰
  "Ud766b544d2af8c0648450562653dde2c"  // 飯小靜
];

const BOSSES = [
  "U1cb929477a940c15a579c794ab40dc32" // 林傳峰
];

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();

  if (r === "supervisor") return "supervisor";
  if (r === "boss") return "boss";

  return "";
}

function hasPermission(role, userId) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "supervisor") {
    return SUPERVISORS.includes(userId);
  }

  if (normalizedRole === "boss") {
    return BOSSES.includes(userId);
  }

  return false;
}

app.get("/", (req, res) => {
  res.status(200).send("LINE webhook server running");
});

app.post("/webhook", async (req, res) => {
  res.status(200).send("OK");

  try {
    const body = req.body;

    if (!body.events || !Array.isArray(body.events)) {
      return;
    }

    for (const event of body.events) {
      const userId = event.source?.userId || "";
      console.log("👉 userId:", userId);

      let displayName = "未知";
      const profile = await getProfile(event);
      displayName = profile.displayName || "未知";
      console.log("👉 displayName:", displayName);

      if (event.type === "message" && event.message?.type === "text") {
        continue;
      }

      if (event.type === "postback") {
        let data = {};

        try {
          data = JSON.parse(event.postback.data || "{}");
        } catch (err) {
          await replyText(event.replyToken, "❌ 按鈕資料錯誤");
          continue;
        }

        const row = Number(data.row || 0);
        const action = String(data.action || "").trim().toLowerCase();
        const role = normalizeRole(data.role);

        console.log("👉 row:", row);
        console.log("👉 action:", action);
        console.log("👉 role:", role);

        if (!row || !action || !role) {
          await replyText(event.replyToken, "❌ 缺少必要資料");
          continue;
        }

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
        messages: [{ type: "text", text }]
      })
    });
  } catch (err) {
    console.error("replyText error:", err);
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GAS_WEBAPP_URL = (process.env.GAS_WEBAPP_URL || "").trim();
const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

// 健康檢查
app.get("/", (req, res) => {
  res.status(200).send("LINE webhook server running");
});

// LINE webhook
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("Webhook body:", JSON.stringify(body));

    if (!body.events || !Array.isArray(body.events)) {
      return res.status(200).send("OK");
    }

    for (const event of body.events) {
      console.log("Event:", JSON.stringify(event));

      if (event.type === "message" && event.message?.type === "text") {
        await replyText(event.replyToken, `你剛剛說：${event.message.text}`);
        continue;
      }

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

        const lineUserId = event.source?.userId || "";
        let displayName = "未知";

        if (lineUserId) {
          const profile = await getProfile(lineUserId);
          displayName = profile.displayName || "未知";
        }

        console.log("displayName:", displayName);
        console.log("GAS_WEBAPP_URL:", GAS_WEBAPP_URL);

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
          }
        }

        return res.status(200).send("OK");
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(200).send("OK");
  }
});

async function getProfile(userId) {
  try {
    const resp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
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

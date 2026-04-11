const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 👉 你的 Apps Script Web App
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;

// ===== 測試用 =====
app.get("/", (req, res) => {
  res.status(200).send("LINE webhook OK");
});

// ===== LINE webhook =====
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body.events) {
      return res.status(200).send("OK");
    }

    for (const event of body.events) {
      if (event.type === "postback") {
        const data = JSON.parse(event.postback.data || "{}");

        const row = data.row;
        const action = data.action;
        const role = data.role;

        let url = "";

        if (action === "review") {
          url = `${GAS_WEBAPP_URL}?row=${row}&action=review&role=${role}`;
        }

        if (action === "done") {
          url = `${GAS_WEBAPP_URL}?row=${row}&action=done`;
        }

        if (url) {
          await fetch(url);
        }

        await reply(event.replyToken, "✅ 已更新");
      }
    }

    res.status(200).send("OK");

  } catch (err) {
    console.log(err);
    res.status(200).send("OK");
  }
});

// ===== 回覆 LINE =====
async function reply(token, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.LINE_CHANNEL_ACCESS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken: token,
      messages: [{ type: "text", text }]
    })
  });
}

app.listen(PORT, () => {
  console.log("Server running");
});
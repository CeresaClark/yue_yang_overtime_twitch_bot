// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// 儲存目前在線的 clients（使用 SSE 方式）
let clients = [];

app.use(cors());
app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// 伺服器接收 Twitch EventSub Webhook
app.post('/twitch/eventsub', (req, res) => {
    const type = req.headers['twitch-eventsub-message-type'];

    if (type === 'webhook_callback_verification') {
        console.log('✅ Twitch 正在驗證 Webhook');
        return res.status(200).send(req.body.challenge);
    }

    if (type === 'notification') {
        const event = req.body.event;
        const subscriptionType = req.body.subscription.type;
        console.log('📨 收到事件:', subscriptionType);

        let payload = null;
        if (subscriptionType === 'channel.channel_points_custom_reward_redemption.add') {
            const cost = event.reward?.cost || 0;
            payload = { type: 'channel_points', points: cost };
        } else if (subscriptionType === 'channel.subscription.gift') {
            payload = { type: 'subscription', is_gift: true, quantity: event.total || 1 };
        } else if (subscriptionType === 'channel.subscribe') {
            payload = { type: 'subscription', is_gift: false, quantity: 1 };
        }

        if (payload) {
            // 傳送給所有連線中的 client（SSE）
            clients.forEach(client => client.res.write(`data: ${JSON.stringify(payload)}\n\n`));
            console.log('📤 發送給前端:', payload);
        }

        return res.status(204).end();
    }

    return res.status(204).end();
});

// SSE 連線端點（前端連線後會持續接收推播）
app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    console.log(`🟢 新連線: ${clientId}，目前連線數: ${clients.length}`);

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
        console.log(`🔴 離線: ${clientId}，剩餘連線數: ${clients.length}`);
    });
});

app.listen(PORT, () => {
    console.log(`✅ Webhook Server 運作中，監聽 PORT ${PORT}`);
});

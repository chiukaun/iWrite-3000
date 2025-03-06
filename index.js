require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const FormData = require('form-data');

// 設定 LINE Bot SDK
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// 設定 OpenAI API
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();

// 設定 LINE webhook 路由
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
  res.status(200).end();
});

const client = new line.Client(config);

// 處理事件
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'audio') {
    return Promise.resolve(null);
  }

  try {
    // 下載語音檔案
    const audioFilePath = await downloadAudio(event.message.id);
    
    // 將語音轉換為文字
    const transcription = await transcribeAudio(audioFilePath);
    
    // 刪除臨時檔案
    fs.unlinkSync(audioFilePath);
    
    // 回覆文字訊息
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `語音轉文字結果：\n${transcription}`
    });
  } catch (error) {
    console.error('處理語音訊息時發生錯誤:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '抱歉，語音轉文字失敗。請再試一次。'
    });
  }
}

// 下載語音檔案
async function downloadAudio(messageId) {
  const stream = await client.getMessageContent(messageId);
  const tempFilePath = path.join(__dirname, 'temp', `${messageId}.m4a`);
  
  // 確保臨時目錄存在
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'));
  }
  
  // 將音檔保存到臨時文件
  await pipeline(stream, fs.createWriteStream(tempFilePath));
  
  return tempFilePath;
}

// 使用 OpenAI Whisper API 進行語音轉文字
async function transcribeAudio(audioFilePath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(audioFilePath));
  formData.append('model', 'whisper-1');
  formData.append('language', 'zh'); // 指定語言為中文

  try {
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      }
    });

    return response.data.text;
  } catch (error) {
    console.error('OpenAI API 調用失敗:', error.response?.data || error.message);
    throw new Error('語音轉文字失敗');
  }
}

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服務運行在 port ${PORT}`);
}); 
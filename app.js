import schedule from "node-schedule"
import { WebClient } from '@slack/web-api'
import axios from "axios";

const corePrefix = process.env.CORE_PREFIX
const SLACK_CHANNEL = process.env.SLACK_CHANNEL
const web = new WebClient(process.env.SLACK_TOKEN)

// Function to execute the query and send Slack message if rows > 0
async function executeQueryAndSendSlackMessage(letter) {
  console.log(`${new Date().toLocaleString()} Checking ${letter}`)
  try {
    let response = await axios.get(`${corePrefix}/api/v1/informes/check-stock-dvf?sessionId=WzI3LDM0LDIxLDEyLDk0XQ==&bodega=${letter}`)
    response = response.data
    if (response.data.length == 0) {
      return
    }
    let message = `ANTUMALAL: Errores en el inventario en Sucursal ${letter} consulta retornó ${response.data.length} fila(s) \n`;
    for (let d of response.data) {
      message += `${d.codName} \n`
    }
    await sendSlackMessage(message);
  } catch (error) {
    console.error(`Error for letter ${letter}: ${error.message}`);
  }
}

// Function to send a message to Slack using async/await
async function sendSlackMessage(message) {
  try {
    // Use the `chat.postMessage` method to send a message from this app
    await web.chat.postMessage({
      channel: `#${SLACK_CHANNEL}`,
      text: message,
    });
    console.log('Alerta enviada');
  } catch (error) {
    console.log(error);
  }
}

// schedule.scheduleJob('* * * * *', async () => {
// run every hour but no on weekends and not at night
schedule.scheduleJob('0 8-17 * * 1-5', async () => {
  for (let i = 65; i <= 72; i++) {
    const letter = String.fromCharCode(i);
    await executeQueryAndSendSlackMessage(letter);
  }
});

console.log('Scheduled job started');
import schedule from "node-schedule";
import { WebClient } from "@slack/web-api";
import axios from "axios";

const COREPREFIX = process.env.CORE_PREFIX;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
const SESSIONID = process.env.SESSIONID;
const web = new WebClient(process.env.SLACK_TOKEN);

// Global variable to hold email destinatarios from configuration
let emailDestinatarios = "";

/**
 * Retrieves configuration from the API.
 * Expects variables "local_autoCheckStockNotificaVia", "local_autoCheckStockCron",
 * and "local_autoCheckStockEmailDestinatarios".
 * Returns an object with these values.
 */
async function getConfig() {
  try {
    const configResponse = await axios.get(
      `${COREPREFIX}/api/v1/api-get-config-local`,
      {
        params: {
          sessionId: SESSIONID,
          variable: [
            "local_autoCheckStockNotificaVia",
            "local_autoCheckStockCron",
            "local_autoCheckStockEmailDestinatarios",
          ],
        },
      }
    );

    const autoCheckStockNotificaVia = configResponse.data.data.find(
      (item) => item.variable === "local_autoCheckStockNotificaVia"
    )?.valor;
    const autoCheckStockCron = configResponse.data.data.find(
      (item) => item.variable === "local_autoCheckStockCron"
    )?.valor;
    const autoCheckStockEmailDestinatarios = configResponse.data.data.find(
      (item) => item.variable === "local_autoCheckStockEmailDestinatarios"
    )?.valor;

    return { autoCheckStockNotificaVia, autoCheckStockCron, autoCheckStockEmailDestinatarios };
  } catch (error) {
    console.error("Error fetching configuration:", error);
    throw error;
  }
}

/**
 * Sends a message to Slack.
 */
async function sendSlackMessage(message) {
  try {
    await web.chat.postMessage({
      channel: `#${SLACK_CHANNEL}`,
      text: message,
    });
    console.log("Slack alert sent");
  } catch (error) {
    console.error("Error sending Slack message:", error);
  }
}

/**
 * Sends an email by calling an external API.
 * Uses the global variable "emailDestinatarios" for the destinatarios field.
 */
async function sendEmail(message) {
  try {
    const response = await axios.post(
      `${COREPREFIX}/api/v1/utilities/api-post-send-email`,
      {
          sessionId: SESSIONID,
          subject: "Notificacion Diferencia Stock",
          template: "email-info",
          destinatarios: emailDestinatarios.split(",").map(email => email.trim()), // trim each email
          body: message,
      }
    );
    console.log("Email alert sent", response.data);
  } catch (error) {
    console.error("Error sending email alert:", error);
  }
}

/**
 * Sends notification based on the configuration.
 * @param {string} message - The alert message.
 * @param {string} notifyVia - "S" for Slack, "E" for Email, or "A" for both.
 */
async function sendNotification(message, notifyVia) {
  if (notifyVia === "S" || notifyVia === "A") {
    await sendSlackMessage(message);
  }
  if (notifyVia === "E" || notifyVia === "A") {
    await sendEmail(message);
  }
}

/**
 * Executes the query for a given letter.
 * If the API returns rows, an alert message is built and then sent via the configured channels.
 * @param {string} letter - The letter representing a branch or bodega.
 * @param {string} notifyVia - The notification method from config.
 */
async function executeQuery(letter, notifyVia) {
  console.log(`${new Date().toLocaleString()} Checking ${letter}`);
  try {
    const responseObj = await axios.get(`${COREPREFIX}/api/v1/informes/check-stock-dvf`, {
      params: {
        sessionId: SESSIONID,
        bodega: letter,
      },
    });
    const response = responseObj.data;
    if (!response.data || response.data.length === 0) {
      return;
    }
    let message = `ANTUMALAL: Errores en el inventario en Sucursal ${letter}. Consulta retornó ${response.data.length} fila(s):\n`;
    for (const d of response.data) {
      message += `${d.codName}\n`;
    }
    await sendNotification(message, notifyVia);
  } catch (error) {
    console.error(`Error for letter ${letter}: ${error.message}`);
  }
}

/**
 * Main function:
 * 1. Fetches configuration.
 * 2. Schedules the cron job based on the fetched cron expression.
 * 3. Iterates over the branches (from A to H) and executes the query.
 */
async function main() {
  try {
    const config = await getConfig();
    console.log("Configuration fetched:", config);

    // Update the global emailDestinatarios from config
    emailDestinatarios = config.autoCheckStockEmailDestinatarios;

    // Schedule the job using the cron expression from config
    schedule.scheduleJob(config.autoCheckStockCron, async () => {
      // Iterate over ASCII codes 65 (A) to 72 (H)
      for (let i = 65; i <= 72; i++) {
        const letter = String.fromCharCode(i);
        await executeQuery(letter, config.autoCheckStockNotificaVia);
      }
    });
    console.log("Scheduled job started with cron:", config.autoCheckStockCron);
  } catch (error) {
    console.error("Failed to start scheduled job:", error);
  }
}

// Start the application
main();
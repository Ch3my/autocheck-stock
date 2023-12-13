import mysql from "mysql"
import schedule from "node-schedule"
import { WebClient } from '@slack/web-api'

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};
const web = new WebClient(process.env.SLACK_TOKEN)
const SLACK_CHANNEL = process.env.SLACK_CHANNEL

// Function to execute the query and send Slack message if rows > 0
async function executeQueryAndSendSlackMessage(connection, letter) {
  const query = `CALL CalculateDifference("${letter}");`;
  console.log(`${new Date().toLocaleString()} Checking ${letter}`)

  // Se trae todos los componentes de items compuestos para verificar si el padre tiene unidades pendientes
  const tabicomp = await queryDatabase(connection, "SELECT * FROM TABICOMP");

  try {
    // Trae un array de 2, el primer elemento es como rows
    const results = await callDatabase(connection, query);
    if (results.length > 0) {
      for (let [index, r] of [...results.entries()].reverse()) {
        if (tabicomp.some(o => o.CODITE == r.CODIGO)) {
          // El item con inventario malo es un componente, posiblemente su padre fue vendido?
          let thisComponente = tabicomp.find(o => o.CODITE == r.CODIGO)

          let undPendientesPadre = await queryDatabase(connection,
            `select * from MOVDET
            where MOVDET.SALDO > 0
            AND MOVDET.FEC_SIS >= "2023-01-01"
            AND MOVDET.MOVMTO IN ("55", "25")
            AND MOVDET.ESTADO = 'P'
            AND MOVDET.SALIDA = "${letter}"
            and MOVDET.CODITE = "${thisComponente.CODIGO}"`
          )
          let totalUndPendientesHijoCalculadas = 0
          for (let undPadre of undPendientesPadre) {
            totalUndPendientesHijoCalculadas += undPadre.UNIDADES * thisComponente.UNIDADES
          }
          if ((totalUndPendientesHijoCalculadas + r.saldo_nvs + r.DOCUM) == r.FISICO) {
            // El stock esta bien, hay que eliminar la fila
            results.splice(index, 1);
          }
        }
      }
      if (results.length > 0) {
        const message = `ANTUMALAL: Errores en el inventario en Sucursal ${letter} consulta retornó ${results.length} fila(s).`;
        await sendSlackMessage(message);
      }
    }
  } catch (error) {
    console.error(`Error for letter ${letter}: ${error.message}`);
  }
}

// Function to query the database using async/await
function callDatabase(connection, query) {
  return new Promise((resolve, reject) => {
    connection.query(query, (error, [results, info], fields) => {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}
// Function to query the database using async/await
function queryDatabase(connection, query) {
  return new Promise((resolve, reject) => {
    connection.query(query, (error, results, fields) => {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
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

// schedule.scheduleJob('0 * * * *', async () => {

// run every hour but no on weekends and not at night
schedule.scheduleJob('0 8-17 * * 1-5', async () => {
  const connection = mysql.createConnection(dbConfig);
  connection.connect();

  for (let i = 65; i <= 72; i++) {
    const letter = String.fromCharCode(i);
    await executeQueryAndSendSlackMessage(connection, letter);
  }

  connection.end();
});

console.log('Scheduled job started');
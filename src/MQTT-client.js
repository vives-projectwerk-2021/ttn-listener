const mqtt = require('mqtt')
const Transmitter = require('./api/data-post.js')
const Validator = require('jsonschema').Validator;
const schema = require('../schema-decoded-payload.json')
require('dotenv').config()

const client  = mqtt.connect(`mqtts://${process.env.BROKER_ADDRESS}`, {
  'username': `${process.env.MQTT_USERNAME}`,
  'password': `${process.env.MQTT_PASSWORD}`,
  'clientId': 'mqttjs_' + Math.random().toString(16).substr(2, 8)
})

client.on('connect', () => {
  client.subscribe('#', (err) => {
    // console.log(err)
  })
})

client.on('message', (topic, message) => {
  let msg = JSON.parse(message.toString())
  console.log(msg)
  let isValid = validateLoraMessage(msg)
  if(isValid){
    let formatted = formatLoraMessage(msg)
    Transmitter.postPayload(formatted)
  }
})

//handle errors
client.on("error", (error) => {
  console.log("Can't connect " + error)
  process.exit(1)
})

var v = new Validator();

function validateLoraMessage(msg) {
  let validatorResult = ""

  try{
    if(msg.uplink_message && msg.uplink_message.decoded_payload){
      validatorResult = v.validate(msg.uplink_message.decoded_payload, schema)
    }
  } catch (err) {
    console.log(err)
  }

  if(validatorResult.valid){
    console.log("Message is valid")
    return true
  } else {
    console.log("error: " + validatorResult.errors)
    return false
  }
}

function formatLoraMessage(msg) {
  // Get strongest RSSI and it's gateway
  const [bestRSSI, bestGateway] = getStrongestConnection(msg.uplink_message.rx_metadata)

  return {
    "message": "sensor-data", 
    "data": {
      "device_id": msg.end_device_ids.device_id,
      "time": msg.received_at,
      "count": msg.uplink_message.f_cnt,
      "sensors": msg.uplink_message.decoded_payload.sensors,
      "meta": {
        "gateway_cnt": msg.uplink_message.rx_metadata.length,
        "strongest_rssi": bestRSSI,
        "strongest_gateway": bestGateway,
      }
    }
  }
}

function getStrongestConnection(metadata){
  // Create array of RSSIs and Gateways
  let RssiArr = metadata.map((e) => e.rssi)
  let GatewayArr = metadata.map((e) => e.packet_broker.forwarder_cluster_id)
  let ComboArr = [RssiArr, GatewayArr]
  // Transpose array
  ComboArr = ComboArr[0].map((col, i) => ComboArr.map(row => row[i]))
  // Sort to get lowest (best) RSSI
  let strongestCombo = ComboArr.sort((a, b) => a[0] - b[0])
  return strongestCombo[0]
}
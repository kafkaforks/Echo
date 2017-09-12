/* @flow */

import React, {Component} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Platform} from 'react-native';

let WebRTC = require('react-native-webrtc');

let {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  MediaStreamTrack,
  getUserMedia
} = WebRTC;

let container;
let audioStream;
let localStream;
let peerconnection;
let iceCandidates = [];

const configuration = {
  "iceServers": [
    {
      "url": "stun:stun.l.google.com:19302"
    }
  ]
};

const url = 'ws://192.168.0.90:8443/signaling'

let ws;

/*
 * Definition of functions
 */

 function getUserMediaConstraints() {
   let constraints = {};
   constraints.audio = true;
   constraints.video = false;
   return constraints;
 }

 function getLocalStream(callback) {
   getUserMedia(getUserMediaConstraints(), function(stream) {
     console.log('getUserMedia success', stream);
     callback(stream);
   }, logError);
 }

function onError(error) {
  console.error(error);
}

function startResponse(message) {
  console.log('SDP answer received from server. Processing ...');
  const sessionDescription = {
    type: 'answer',
    sdp: message.sdpAnswer
  };

  peerconnection.setRemoteDescription(new RTCSessionDescription(sessionDescription), () => {
    // After receiving the SDP we add again the ice candidates, in case they were forgotten (bug)
    iceCandidates.forEach((iceCandidate) => {
      peerconnection.addIceCandidate(iceCandidate);
    });
  }, onError);

}

function sendMessage(message) {
  let jsonMessage = JSON.stringify(message);
  console.log('Sending message: ' + jsonMessage);
  ws.send(jsonMessage);
}

function logError(error) {
  console.log("logError", error);
}

function createPC() {
  const pc = new RTCPeerConnection(configuration);

  pc.onicecandidate = function(event) {
    console.log('onicecandidate', event.candidate);
    if (event.candidate) {
      const message = {
        id: 'onIceCandidate',
        candidate: event.candidate
      };
      sendMessage(message);
    }
  };

  function createOffer() {
    pc.createOffer(function(desc) {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, function() {
        console.log('setLocalDescription', pc.localDescription);

        const message = {
          id: 'start',
          sdpOffer: pc.localDescription.sdp
        }
        sendMessage(message);

      }, logError);
    }, logError);
  }

  pc.onnegotiationneeded = function() {
    console.log('onnegotiationneeded');
    createOffer();
  }

  pc.oniceconnectionstatechange = function(event) {
    console.log('oniceconnectionstatechange', event.target.iceConnectionState);
  };
  pc.onsignalingstatechange = function(event) {
    console.log('onsignalingstatechange', event.target.signalingState);
  };

  pc.onaddstream = function(event) {
    console.log('onaddstream', event.stream);
    audioStream = event.stream;
    container.setState({audioURL: audioStream.toURL(), isConnecting: false});
  };
  pc.onremovestream = function(event) {
    console.log('onremovestream', event.stream);
  };

  pc.addStream(localStream);

  return pc;
}

function start() {
  container.setState({isConnecting: true});
  peerconnection = createPC();
}

function stop() {
  if (peerconnection) {

    const message = {
      id: 'stop'
    }
    sendMessage(message);

    container.setState({audioURL: null, isConnecting: false});
    peerconnection.close();
  }
}


function initialize(){
  ws = new WebSocket(url);

  /*
   * Management of WebSocket messages
   */

  ws.onopen = () => {
    // connection opened
    console.log('Websocket Connected');
    getLocalStream(function(stream) {
      localStream = stream;
      container.setState({isOnline: true});
    });
  };

  ws.onmessage = (message) => {
    // a message was received
    let parsedMessage = JSON.parse(message.data);
    console.log('Received message: ' + message.data);

    switch (parsedMessage.id) {
      case 'startResponse':
        startResponse(parsedMessage);
        break;
      case 'error':
        onError('Error message from server: ' + parsedMessage.message);
        break;
      case 'iceCandidate':
        const iceCandidate = new RTCIceCandidate(parsedMessage.candidate);

        if (peerconnection) {
          peerconnection.addIceCandidate(iceCandidate);
        }

        iceCandidates.push(iceCandidate);
        break;
      default:
        onError('Unrecognized message', parsedMessage);
    }

  };

  ws.onerror = (e) => {
    // an error occurred
    console.log(e.message);
  };

  ws.onclose = (e) => {
    // connection closed
    console.log('Connection Closed');
    container.setState({isOnline: false});
    console.log('Reconnecting...');
    setTimeout(function(){initialize()}, 3000);

  };
}


/*
 * Component Class
 */
class App extends Component {

  componentWillMount(){
   initialize();
  }

  constructor(props) {
    super(props);
    container = this;
    this.state = {
      audioURL: null,
      isConnecting: false,
      isOnline: false
    }
  }

  trigger = () => {
    if (!this.state.isConnecting) {
      if (this.state.audioURL) {
        stop();
      } else {
        start();
      }
    }
  }

  render() {

    return (
      <View style={{
        flex: 1
      }}>
        <View style={{
          height: 64,
          backgroundColor: '#ffffff',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: 'bold',
            color: '#0a0a0a'
          }}>
            Echo Client
          </Text>
        </View>
        <View style={{
          height: 2,
          backgroundColor: '#a3a3a3'
        }}/>
        <View>
          {this.state.audioURL && (<RTCView streamURL={this.state.audioURL}/>)}
        </View>
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Text style={{
            margin: 32,
            textAlign: 'center'
          }}>
            Transmit audio to the application server and return the corresponding echo.
          </Text>

          <TouchableOpacity disabled={!this.state.isOnline} style={{
            margin: 16
          }} onPress={() => this.trigger()}>
            <View style={{
              backgroundColor: '#cdcdcd',
              width: 128,
              height: 48,
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Text>
                {this.state.audioURL
                  ? `Stop`
                  : `Start`}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

export default App;

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const manager = new BleManager();

const BleTerminal = () => {
  const [devices, setDevices] = useState([]);
  const [message, setMessage] = useState('');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [serviceUUID] = useState('000000FF-0000-1000-8000-00805f9b34fb');
  const [characteristicUUID] = useState('0000FF01-0000-1000-8000-00805f9b34fb');
  const [incomingMessages, setIncomingMessages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [wifiResponse, setWifiResponse] = useState('');

  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, []);

  useEffect(() => {
    if (connectedDevice) {
      const interval = setInterval(() => {
        getAndSetIpAddress();
      }, 1000); // Adjust the interval as needed

      return () => clearInterval(interval);
    }
  }, [connectedDevice]);

  const scanForDevices = async () => {
    if (scanning) return;
    setDevices([]);
    setScanning(true);
    manager.startDeviceScan([serviceUUID], null, (error, device) => {
      if (error) {
        console.error(error);
        return;
      }
      if (device) {
        setDevices((prevDevices) => {
          const deviceExists = prevDevices.some((d) => d.id === device.id);
          if (!deviceExists) return [...prevDevices, device];
          return prevDevices;
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
    }, 5000);
  };

  const connectToDevice = async (device) => {
    if (connectedDevice) {
      console.log('Already connected to another device');
      return;
    }

    console.log(`Connecting to device: ${device.name || device.id}`);
    manager.stopDeviceScan();

    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      setConnectionStatus(`Connected to ${connected.name || connected.id}`);
      setModalVisible(true);

      enableNotifications(connected);
    } catch (error) {
      console.error('Connection error:', error);
      setConnectionStatus(`Connection failed: ${error.message}`);
      setModalVisible(true);
    }
  };

  const enableNotifications = async (device) => {
    try {
      await device.discoverAllServicesAndCharacteristics();
      const characteristic = await device.readCharacteristicForService(serviceUUID, characteristicUUID);
  
      if (!characteristic) {
        throw new Error('Characteristic not found');
      }
  
      characteristic.monitor(async (error, char) => {
        if (error) {
          return;
        }
        if (char.value) {
          const bytes = Buffer.from(char.value, 'base64');
          const message = bytes.toString('utf-8');
          setIncomingMessages(message)
          console.log('Incoming: ', message);
        }
      });
  
      console.log('Notifications enabled successfully');
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      setConnectionStatus(`Failed to enable notifications: ${error.message}`);
      setModalVisible(true);
    }
  };
  
  useEffect(() => {
    if (incomingMessages) {
      try {
        const msg = JSON.parse(incomingMessages); // Clean up the message
        if (msg.IP) {
          const ip = convertHexToIPv4(msg.IP);
          setIpAddress(ip);
        }
      } catch (error) {
        console.log(error);
      }
    }
  }, [incomingMessages]);
  

  const getAndSetIpAddress = async () => {
    if (connectedDevice) {
      try {
        const ipreq = '{"request":"get_ip"}'
        const messageArray = Buffer.from(ipreq, 'utf-8');
        const messageEncoded = messageArray.toString('base64');
        await connectedDevice.writeCharacteristicWithResponseForService(
          serviceUUID,
          characteristicUUID,
          messageEncoded
        );

      } catch (error) {
        console.error('Failed to send message:', error);
        setConnectionStatus(`Failed to send message: ${error.message}`);
        setModalVisible(true);
      }
    }
  };

  const sendWiFiRequest = async () => {
    if (!ipAddress) {
      console.error('IP address is empty');
      return;
    }

    try {
      const response = await fetch(`http://${ipAddress}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: message,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.text();
      console.log('WiFi request response:', data);
      setWifiResponse(data); // Update state with the WiFi response
    } catch (error) {
      console.error('Failed to send WiFi request:', error);
      setConnectionStatus(`Failed to send WiFi request: ${error.message}`);
      setModalVisible(true);
    }
  };

  const disconnectDevice = () => {
    if (connectedDevice) {
      connectedDevice.cancelConnection()
        .then(() => {
          console.log('Device disconnected');
          setConnectedDevice(null);
          setConnectionStatus('Disconnected');
          setModalVisible(true);
          setDevices([]);
        })
        .catch((error) => {
          console.error('Disconnection error:', error);
        });
    }
  };

  const convertHexToIPv4 = (hex) => {
    if (hex.startsWith('0x')) {
      hex = hex.slice(2);
    }

    hex = hex.padStart(8, '0');

    const parts = [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      parseInt(hex.slice(6, 8), 16),
    ];

    return parts.join('.');
  };

  const startScan = async () => {
    if (connectedDevice) {
      disconnectDevice();
    }
    await scanForDevices();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      style={styles.container}
    >
      <View style={styles.container}>
        <Text style={styles.title}> RPE Controls</Text>
        <TouchableOpacity style={styles.deviceButton} onPress={startScan}>
          <Text style={styles.deviceName}>Scan</Text>
        </TouchableOpacity>

        {!connectedDevice ? (
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceButton} onPress={() => connectToDevice(item)}>
                <Text style={styles.deviceName}>{item.name || 'Unnamed Device'}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.deviceList}
          />
        ) : (
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>Connected to: {connectedDevice.name || connectedDevice.id}</Text>
            <Text style={styles.infoText}>Responses:</Text>
            <Text>{ipAddress}</Text>
          </View>
        )}

        {connectedDevice && (
          <View style={styles.inputWrapper}>
            {/* <Button title="Get IP and Send" onPress={getAndSetIpAddress} /> */}
            <TextInput
              style={styles.input}
              placeholder="Type your message"
              value={message}
              onChangeText={setMessage}
            />
            <View style={styles.buttonContainer}>
              <Button title="Send WiFi" onPress={sendWiFiRequest} />
              <Button title="Disconnect" onPress={disconnectDevice} color="red" />
            </View>
          </View>
        )}

        {/* Modal for Connection Status */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalView}>
              <Text style={styles.modalText}>{connectionStatus}</Text>
              <Button title="Close" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </Modal>

        {/* Display WiFi Response */}
        {wifiResponse && connectedDevice ? (
          <View style={styles.wifiResponseContainer}>
            <Text style={styles.wifiResponseTitle}>WiFi Response:</Text>
            <Text>{wifiResponse}</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  deviceList: {
    width: '100%',
  },
  deviceButton: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    marginVertical: 5,
    width: '100%',
  },
  deviceName: {
    fontSize: 18,
  },
  deviceInfo: {
    marginVertical: 20,
    alignItems: 'center',
  },
  inputWrapper: {
    width: '100%',
    marginTop: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    width: '100%',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
  },
  infoText: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: 'bold',
  },
  wifiResponseContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  wifiResponseTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default BleTerminal;

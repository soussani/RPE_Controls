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
import { Buffer } from 'buffer'
import { fromByteArray, toByteArray } from 'base64-js';

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
  const [ipAddress, setIpAddress] = useState('')

  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, []);


  const encodeMessage = (message) => {
    const buffer = Buffer.from(message, 'utf-8');
    return buffer.toString('base64');
  };
  
  // Decode a Base64 string
  const decodeMessage = (base64String) => {
    const buffer = Buffer.from(base64String, 'base64');
    return buffer.toString('utf-8');
  };


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
  
      characteristic.monitor((error, char) => {
        if (error) {
          console.error('Notification error:', error);
          return;
        }
        if (char.value) {
          const bytes = Buffer.from(char.value, 'base64');
          const message = bytes.toString('utf-8');
          setIncomingMessages((prevMessages) => [...prevMessages, message]);
          console.log('Notification received:', message);
          setIpAddress(message)
        }
      });
  
      console.log('Notifications enabled successfully');
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      setConnectionStatus(`Failed to enable notifications: ${error.message}`);
      setModalVisible(true);
    }
  };

  const sendMessage = async () => {
    if (connectedDevice) {
      try {
        const messageArray = Buffer.from(message, 'utf-8');
        const messageEncoded = messageArray.toString('base64');
        await connectedDevice.writeCharacteristicWithResponseForService(
          serviceUUID,
          characteristicUUID,
          messageEncoded
        );
        setMessage('');
        console.log('Message sent:', message);
      } catch (error) {
        console.error('Failed to send message:', error);
        setConnectionStatus(`Failed to send message: ${error.message}`);
        setModalVisible(true);
      }
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
        <Text style={styles.title}>BLE Terminal</Text>
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
            {incomingMessages.map((msg, index) => (
              <Text key={index} style={styles.incomingMessage}>{msg}</Text>
            ))}
          </View>
        )}

        {connectedDevice && (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type your message"
              value={message}
              onChangeText={setMessage}
            />
            <Button title="Send" onPress={sendMessage} />
            <Button title="Disconnect" onPress={disconnectDevice} color="red" />
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
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  deviceList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  deviceButton: {
    padding: 15,
    marginVertical: 5,
    backgroundColor: '#007bff',
    borderRadius: 5,
  },
  deviceName: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  deviceInfo: {
    marginVertical: 20,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 16,
    marginVertical: 2,
  },
  incomingMessage: {
    fontSize: 14,
    marginVertical: 2,
    color: 'green',
  },
  inputContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    width: '80%',
    borderRadius: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    width: '80%',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    elevation: 5,
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 18,
  },
});

export default BleTerminal;

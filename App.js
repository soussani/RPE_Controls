// App.js
import React from 'react';
import { SafeAreaView } from 'react-native';
import BleTerminal from './src/BleTerminal.js';

const App = () => {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <BleTerminal />
    </SafeAreaView>
  );
};

export default App;
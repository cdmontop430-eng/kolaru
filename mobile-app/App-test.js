import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>Veera Mobile Control</Text>
      <Text style={styles.test}>App is working!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f18', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#f04f8a', fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  test: { color: '#39d98a', fontSize: 16 }
});

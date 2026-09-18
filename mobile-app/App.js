import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestRecordingPermissionsAsync, useAudioStream } from 'expo-audio';
import {
  Alert,
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

const logo = require('./assets/veera-logo.webp');
const aura = require('./assets/shadow-aura.gif');

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : B64_CHARS[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : B64_CHARS[b2 & 63];
  }
  return out;
}

function Button({ title, onPress, active, danger }) {
  return (
    <Pressable onPress={onPress} style={[styles.button, active && styles.buttonActive, danger && styles.buttonDanger]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function Slider({ value, min, max, onChange }) {
  const fill = `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%`;
  return (
    <View style={styles.sliderTrack}>
      <View style={[styles.sliderFill, { width: fill }]} />
      <View style={styles.sliderSteps}>
        {[0, 1, 2, 3, 4].map((step) => (
          <Pressable key={step} onPress={() => onChange(Math.round(min + ((max - min) * step) / 4))} style={styles.sliderStep} />
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('tokens');
  const [tokenName, setTokenName] = useState('');
  const [token, setToken] = useState('');
  const [tokens, setTokens] = useState([]);
  const [serverTokens, setServerTokens] = useState([]);
  const [backend, setBackend] = useState('');
  const [power, setPower] = useState(1000);
  const [micBoost, setMicBoost] = useState(5);
  const [micLive, setMicLive] = useState(false);
  const [distortion, setDistortion] = useState(true);
  const [botsOnline, setBotsOnline] = useState(false);
  const [serverStatus, setServerStatus] = useState('Not connected');
  const [channelId, setChannelId] = useState('');
  const [guildId, setGuildId] = useState('');
  const [fx, setFx] = useState('none');
  const [eqEnabled, setEqEnabled] = useState(false);

  useEffect(() => {
    Promise.all(['veera.tokens', 'veera.backend', 'veera.power', 'veera.micBoost'].map((key) => AsyncStorage.getItem(key))).then((values) => {
      const saved = Object.fromEntries(['veera.tokens', 'veera.backend', 'veera.power', 'veera.micBoost'].map((key, index) => [key, values[index]]));
      if (saved['veera.tokens']) {
        const parsed = JSON.parse(saved['veera.tokens']);
        setTokens(Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object' && typeof item.token === 'string') : []);
      }
      if (saved['veera.backend']) setBackend(saved['veera.backend']);
      if (saved['veera.power'] && Number.isFinite(Number(saved['veera.power']))) setPower(Number(saved['veera.power']));
      if (saved['veera.micBoost'] && Number.isFinite(Number(saved['veera.micBoost']))) setMicBoost(Number(saved['veera.micBoost']));
    }).catch(() => {
      Alert.alert('Saved settings unavailable', 'Some saved settings could not be loaded. You can still use the app.');
    });
  }, []);

  const save = async (key, value) => AsyncStorage.setItem(key, String(value));

  // Live refs so the audio-stream callback always sees the latest backend/live state.
  const micStateRef = useRef({ backend: '', live: false });
  useEffect(() => {
    micStateRef.current = { backend: backend.trim(), live: micLive };
  });

  // Real-time PCM capture from the phone microphone (expo-audio native stream).
  const audioStream = useAudioStream({
    sampleRate: 48000,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      const state = micStateRef.current;
      if (!state.live) return;
      try {
        const body = JSON.stringify({
          data: bytesToBase64(new Uint8Array(buffer.data)),
          sampleRate: buffer.sampleRate,
          channels: buffer.channels,
        });
        if (state.backend) {
          fetch(`${state.backend.replace(/\/$/, '')}/mic/chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }).catch(() => {});
        }
      } catch (e) {}
    },
  });

  const api = async (path, options = {}) => {
    const base = backend.trim().replace(/\/$/, '');
    if (!base) throw new Error('Enter the backend URL first.');
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  };

  const refreshServer = async () => {
    if (!backend.trim()) return;
    try {
      const data = await api('/status');
      const online = Array.isArray(data?.bots) && data.bots.some((bot) => bot.ready);
      setBotsOnline(online);
      setServerStatus(`${data.bots?.length || 0} bot(s) - ${online ? 'online' : 'starting/offline'}`);
      const tokenData = await api('/tokens');
      setServerTokens(Array.isArray(tokenData?.tokens) ? tokenData.tokens : []);
    } catch (error) {
      setServerStatus(error.message);
    }
  };

  useEffect(() => {
    if (!backend.trim()) return undefined;
    refreshServer();
    const timer = setInterval(refreshServer, 5000);
    return () => clearInterval(timer);
  }, [backend]);

  const addToken = async () => {
    const clean = token.trim();
    if (!clean) return Alert.alert('Token required', 'Paste a Discord token first.');
    const next = [...tokens, { id: Date.now().toString(), token: clean, label: tokenName.trim() || `Bot ${tokens.length + 1}` }];
    setTokens(next);
    setTokenName('');
    setToken('');
    await save('veera.tokens', JSON.stringify(next));
    if (backend.trim()) {
      try {
        await api('/tokens/add', { method: 'POST', body: JSON.stringify({ token: clean, name: tokenName.trim() }) });
        await refreshServer();
        Alert.alert('Connected', 'Token added and sent to the bot backend.');
      } catch (error) {
        Alert.alert('Backend token add failed', error.message);
      }
    }
  };

  const runBackend = async (path, success, body) => {
    if (!backend.trim()) {
      return Alert.alert(
        'Backend URL optional',
        'Local mode works without a backend (tokens, settings, mic monitor). To control the bots from your phone, paste your PC/server backend URL in the Audio Control tab.'
      );
    }
    try {
      await api(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      Alert.alert('Veera', success);
      refreshServer();
    } catch (error) {
      Alert.alert('Request failed', error.message);
    }
  };

  const chooseFx = (key) => {
    setFx(key);
    if (backend.trim()) runBackend('/audio/fx', 'Voice FX updated', { fx: key });
  };

  const removeToken = async (item) => {
    const next = tokens.filter((entry) => entry.id !== item.id);
    setTokens(next);
    await save('veera.tokens', JSON.stringify(next));
    if (backend.trim() && item.index != null) {
      try {
        await api('/tokens/delete', { method: 'POST', body: JSON.stringify({ index: item.index }) });
        await refreshServer();
      } catch (error) {
        Alert.alert('Remove failed', error.message);
      }
    }
  };

  const connectToken = async (item) => {
    if (!backend.trim()) return Alert.alert('Backend URL required', 'Enter the bot backend URL first.');
    if (!item.token) return Alert.alert('Already on backend', 'This token is already listed by the backend.');
    try {
      await api('/tokens/add', { method: 'POST', body: JSON.stringify({ token: item.token }) });
      await refreshServer();
      Alert.alert('Connected', `${item.label || item.name || 'Bot'} is connecting.`);
    } catch (error) {
      Alert.alert('Connect failed', error.message);
    }
  };

  const maskToken = (value) => {
    const text = String(value || '');
    return text.length > 14 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
  };

  const TokenVault = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Token manager</Text>
      <Text style={styles.muted}>Add any number of tokens. With a backend URL, Add & Connect starts the bot login flow.</Text>
      <TextInput value={tokenName} onChangeText={setTokenName} placeholder="Bot name (optional)" placeholderTextColor="#7f8798" style={styles.input} />
      <TextInput value={token} onChangeText={setToken} placeholder="Paste Discord token" placeholderTextColor="#7f8798" style={styles.input} autoCapitalize="none" secureTextEntry />
      <Button title={backend.trim() ? 'Add & Connect' : 'Save token locally'} active onPress={addToken} />
      <View style={styles.row}><Text style={styles.sectionLabel}>{backend.trim() ? `${serverTokens.length} backend token(s)` : `${tokens.length} local token(s)`}</Text><Pressable onPress={refreshServer}><Text style={styles.refresh}>Refresh</Text></Pressable></View>
      {(backend.trim() ? serverTokens : tokens).map((item, index) => (
        <View style={styles.tokenRow} key={item.id || `${item.index}-${index}`}>
          <View><Text style={styles.label}>{item.name || item.label || `Bot ${index + 1}`}</Text><Text style={styles.tokenMasked}>{maskToken(item.masked || item.token)}</Text></View>
          <View style={styles.tokenActions}><Text style={[styles.badge, item.ready || item.status === 'ready' ? styles.badgeGood : styles.badgeWait]}>{item.ready || item.status === 'ready' ? 'READY' : (item.status || 'SAVED').toUpperCase()}</Text><Pressable onPress={() => connectToken(item)}><Text style={styles.connect}>Connect</Text></Pressable><Pressable onPress={() => removeToken(item)}><Text style={styles.delete}>Remove</Text></Pressable></View>
        </View>
      ))}
    </View>
  );

  const startMic = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      return Alert.alert('Microphone permission', 'Allow microphone access so the mic route can capture your voice.');
    }
    if (backend.trim()) {
      try {
        await api('/mic/start', { method: 'POST', body: JSON.stringify({ gain: micBoost }) });
      } catch (error) {
        return Alert.alert('Mic route failed', error.message);
      }
    }
    try {
      await audioStream.stream.start();
    } catch (error) {
      setMicLive(false);
      return Alert.alert('Microphone error', error.message);
    }
    setMicLive(true);
  };

  const stopMic = () => {
    try { audioStream.stream.stop(); } catch (e) {}
    setMicLive(false);
    if (backend.trim()) api('/mic/stop', { method: 'POST' }).catch(() => {});
  };

  const Control = () => (
    <>
      <View style={styles.hero}>
        <Text style={styles.kicker}>LIVE AUDIO CONSOLE</Text>
        <Text style={styles.heroTitle}>Control every bot from your phone.</Text>
        <Text style={styles.heroCopy}>Mic routing and audio controls are ready. Connect a backend URL for remote bot actions.</Text>
        <View style={styles.statusRow}><View style={[styles.dot, botsOnline && styles.dotLive]} /><Text style={styles.status}>{backend.trim() ? serverStatus : (botsOnline ? 'Bots online' : 'Bots offline')}</Text></View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bot connection</Text>
        <TextInput value={backend} onChangeText={(v) => { setBackend(v); save('veera.backend', v); }} placeholder="Backend URL (optional)" placeholderTextColor="#7f8798" style={styles.input} autoCapitalize="none" />
        <View style={styles.row}><Button title="Refresh status" active onPress={refreshServer} /><Text style={styles.muted}>{tokens.length} saved token(s)</Text></View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Voice channel</Text>
        <TextInput value={channelId} onChangeText={setChannelId} placeholder="Voice Channel ID" placeholderTextColor="#7f8798" style={styles.input} />
        <TextInput value={guildId} onChangeText={setGuildId} placeholder="Server / Guild ID (optional)" placeholderTextColor="#7f8798" style={styles.input} />
        <View style={styles.row}><Button title="Join VC (All Bots)" active onPress={() => runBackend('/join', 'All bots joining VC', { channelId, guildId })} /><Button title="Leave VC" danger onPress={() => runBackend('/leave', 'All bots left VC')} /></View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Audio player</Text>
        <Text style={styles.muted}>Use the backend upload endpoint, then control playback here.</Text>
        <View style={styles.row}><Button title="Play" active onPress={() => runBackend('/audio/play', 'Audio playing')} /><Button title="Stop" danger onPress={() => runBackend('/audio/stop', 'Audio stopped')} /></View>
        <View style={styles.row}><Button title="Mute" onPress={() => runBackend('/audio/mute', 'Bots muted')} /><Button title="Unmute" onPress={() => runBackend('/audio/unmute', 'Bots unmuted')} /></View>
      </View>
    </>
  );

  const PowerPage = () => (
    <>
      <View style={styles.card}><Text style={styles.cardTitle}>Audio Power - All Bots</Text><Text style={styles.muted}>Shared volume for uploaded audio and mic route.</Text><View style={styles.valueRow}><Text style={styles.label}>Power</Text><Text style={styles.value}>{power}x</Text></View><Slider value={power} min={0} max={10000} onChange={(v) => { setPower(v); save('veera.power', v); if (backend.trim()) api('/audio/volume', { method: 'POST', body: JSON.stringify({ volume: v }) }).catch(() => {}); }} /><View style={styles.presetRow}>{[100, 1000, 2500, 5000, 10000].map((v) => <Pressable key={v} onPress={() => { setPower(v); save('veera.power', v); }}><Text style={styles.preset}>{v}x</Text></Pressable>)}</View></View>
      <View style={styles.card}><Text style={styles.cardTitle}>Voice FX Modules - Audio + Mic</Text><View style={styles.fxGrid}>{['none', 'bass', 'deep', 'chipmunk', 'echo', 'robot', 'radio', 'treble'].map((key) => <Pressable key={key} onPress={() => chooseFx(key)} style={[styles.fxButton, fx === key && styles.fxActive]}><Text style={styles.fxText}>{key.toUpperCase()}</Text></Pressable>)}</View></View>
      <View style={styles.card}><Text style={styles.cardTitle}>Microphone Route - All Bots</Text><Text style={styles.muted}>Captures your phone microphone and streams it live to every bot through the backend. Without a backend URL it runs in local monitor mode.</Text><View style={styles.valueRow}><Text style={styles.label}>Mic Boost</Text><Text style={styles.value}>{micBoost}x</Text></View><Slider value={micBoost} min={0} max={100} onChange={(v) => { setMicBoost(v); save('veera.micBoost', v); if (backend.trim() && micLive) api('/mic/gain', { method: 'POST', body: JSON.stringify({ gain: v }) }).catch(() => {}); }} /><View style={styles.switchRow}><Text style={styles.label}>Voice distortion module</Text><Switch value={distortion} onValueChange={(value) => { setDistortion(value); if (backend.trim()) api('/audio/fx', { method: 'POST', body: JSON.stringify({ fx, distortion: value }) }).catch(() => {}); }} trackColor={{ true: '#f04f8a' }} /></View><View style={styles.switchRow}><Text style={styles.label}>Equalizer ON</Text><Switch value={eqEnabled} onValueChange={(value) => { setEqEnabled(value); if (backend.trim()) runBackend('/audio/eq', 'Equalizer updated', { enabled: value, gains: Array(10).fill(0) }); }} trackColor={{ true: '#f04f8a' }} /></View><Button title={micLive ? 'Stop Mic Route' : 'Start Mic Route'} active={!micLive} danger={micLive} onPress={micLive ? stopMic : startMic} /><View style={styles.micState}><View style={[styles.dot, micLive && styles.dotLive]} /><Text style={styles.status}>{micLive ? 'Microphone route is LIVE' : 'Microphone route is off'}</Text></View></View>
    </>
  );

  return (
    <ImageBackground source={aura} style={styles.background} imageStyle={styles.backgroundImage}>
      <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topbar}><Image source={logo} style={styles.logo} /><View><Text style={styles.brand}>Veera.exe</Text><Text style={styles.subtitle}>MOBILE CONTROL</Text></View><Text style={styles.version}>01</Text></View>
        {tab === 'tokens' ? TokenVault() : tab === 'control' ? Control() : PowerPage()}
      </ScrollView>
      <View style={styles.tabs}><Pressable onPress={() => setTab('tokens')}><Text style={[styles.tab, tab === 'tokens' && styles.tabActive]}>TOKENS</Text></Pressable><Pressable onPress={() => setTab('control')}><Text style={[styles.tab, tab === 'control' && styles.tabActive]}>AUDIO CONTROL</Text></Pressable><Pressable onPress={() => setTab('power')}><Text style={[styles.tab, tab === 'power' && styles.tabActive]}>POWER & MIC</Text></Pressable></View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f18',
  },
  background: { flex: 1, backgroundColor: '#0b0f18' },
  backgroundImage: { opacity: 0.2 },
  content: { padding: 18, paddingBottom: 100 },
  topbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  logo: { width: 48, height: 48, borderRadius: 14, marginRight: 12 },
  brand: { color: '#f8fafc', fontSize: 23, fontWeight: '800' },
  subtitle: { color: '#8b93a7', fontSize: 10, letterSpacing: 2, marginTop: 2 },
  version: { marginLeft: 'auto', color: '#f04f8a', fontWeight: '800' },
  hero: { padding: 20, borderRadius: 20, backgroundColor: '#151b2a', borderWidth: 1, borderColor: '#27334a', marginBottom: 14 },
  kicker: { color: '#f04f8a', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 10, lineHeight: 35 },
  heroCopy: { color: '#aab2c3', fontSize: 14, lineHeight: 21, marginTop: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  dot: { width: 9, height: 9, borderRadius: 9, backgroundColor: '#657084', marginRight: 8 },
  dotLive: { backgroundColor: '#39d98a', shadowColor: '#39d98a', shadowOpacity: 0.8, shadowRadius: 8 },
  status: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: '#121827', borderRadius: 16, borderWidth: 1, borderColor: '#222d42', padding: 16, marginBottom: 14 },
  cardTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  muted: { color: '#8993a7', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  input: { backgroundColor: '#0c111d', borderWidth: 1, borderColor: '#2d3850', borderRadius: 10, color: '#fff', padding: 13, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { backgroundColor: '#2b3854', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', marginTop: 8 },
  buttonActive: { backgroundColor: '#e84482' },
  buttonDanger: { backgroundColor: '#bd315e' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  label: { color: '#cbd3e1', fontSize: 14, fontWeight: '600' },
  value: { color: '#f04f8a', fontWeight: '900', fontSize: 18 },
  sliderTrack: { height: 8, backgroundColor: '#273249', borderRadius: 8, marginTop: 16, overflow: 'hidden' },
  sliderFill: { height: 8, backgroundColor: '#f04f8a' },
  sliderSteps: { position: 'absolute', left: 0, right: 0, top: -8, bottom: -8, flexDirection: 'row', justifyContent: 'space-between' },
  sliderStep: { width: 30 },
  presetRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  preset: { color: '#aab2c3', fontSize: 11, fontWeight: '800' },
  fxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fxButton: { backgroundColor: '#202b40', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  fxActive: { backgroundColor: '#e84482' },
  fxText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  micState: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  tokenRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#222d42', paddingVertical: 14 },
  sectionLabel: { color: '#8993a7', fontSize: 12, fontWeight: '800', marginTop: 18 },
  refresh: { color: '#f04f8a', fontSize: 12, fontWeight: '800', marginTop: 18 },
  tokenMasked: { color: '#7f8798', fontSize: 11, marginTop: 4 },
  tokenActions: { alignItems: 'flex-end', gap: 8 },
  badge: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  badgeGood: { color: '#39d98a' },
  badgeWait: { color: '#eab75b' },
  delete: { color: '#ff6b85', fontSize: 12, fontWeight: '800' },
  connect: { color: '#39d98a', fontSize: 12, fontWeight: '800' },
  tabs: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: '#101624', borderTopWidth: 1, borderTopColor: '#263149', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tab: { color: '#7f8798', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  tabActive: { color: '#f04f8a' },
});

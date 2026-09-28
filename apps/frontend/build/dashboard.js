const api = '/plugins/matterbridge-hass/api/';
const $ = (id) => document.getElementById(id);
const labels = { start: '시작 / 재개', pause: '일시정지', stop: '정지', return_to_base: '충전대로', locate: '위치 알림', clean_spot: '부분 청소' };
let vacuums = [];
let busy = false;
let revision = 0;
let mapSnapshot = null;
let destination = null;
let imageReady = false;
const selectedRooms = new Set();
let roomRevision = null;

function clearMap() {
  mapSnapshot = null; destination = null; imageReady = false;
  $('robot-marker').hidden = true; $('target-marker').hidden = true;
  $('go-to').disabled = true;
  $('location').textContent = '위치 데이터 없음';
  $('target-status').textContent = '지도에서 목적지를 선택한 뒤 이동 버튼을 누르세요.';
}
function updateMapControls() {
  const v = vacuums.find((item) => item.entityId === $('vacuum').value);
  const location = mapSnapshot?.location;
  const validSize = imageReady && location?.width === $('map-image').naturalWidth && location?.height === $('map-image').naturalHeight;
  const pixel = location?.pixel;
  const validPixel = pixel && pixel.x >= 0 && pixel.y >= 0 && pixel.x < location.width && pixel.y < location.height;
  $('robot-marker').hidden = !validSize || !validPixel || location.stale;
  if (!$('robot-marker').hidden) {
    $('robot-marker').style.left = `${pixel.x / location.width * 100}%`;
    $('robot-marker').style.top = `${pixel.y / location.height * 100}%`;
  }
  $('go-to').disabled = busy || !destination || !validSize || location.stale || !location.calibration.length || !v?.advancedControls?.goTo || ['unknown', 'unavailable'].includes(v.state);
  $('target-marker').hidden = !destination || !validSize;
}
function renderAdvanced(vacuum, unavailable) {
  const parent = $('advanced-controls');
  parent.replaceChildren();
  if (roomRevision !== vacuum.metadataRevision) { selectedRooms.clear(); roomRevision = vacuum.metadataRevision; }
  const binding = vacuum.advancedControls || {};
  if (binding.cleanRooms && vacuum.metadata.rooms.length) {
    for (const room of vacuum.metadata.rooms) {
      const label = document.createElement('label');
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selectedRooms.has(room.id); input.disabled = busy || unavailable;
      input.onchange = () => { input.checked ? selectedRooms.add(room.id) : selectedRooms.delete(room.id); renderAdvanced(vacuum, unavailable); };
      label.append(input, document.createTextNode(` ${room.name}`)); parent.append(label);
    }
    button(parent, '선택한 방 청소', { command: 'cleanRooms', rooms: [...selectedRooms], revision: vacuum.metadataRevision }, unavailable || !selectedRooms.size);
  }
  if (binding.startPreset) for (const preset of vacuum.metadata.presets) button(parent, `${preset.name} 실행`, { command: 'startPreset', preset: preset.id, revision: vacuum.metadataRevision }, unavailable);
  if (!binding.cleanRooms && !binding.startPreset) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Settings의 Vacuum Control Bindings에서 Virtual Layer 명령을 연결하면 방 청소·프리셋 실행을 사용할 수 있습니다.'; parent.append(p); }
}


async function request(route, options = {}) {
  const response = await fetch(api + route, { cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}
function choices(element, values, selected) {
  element.replaceChildren(...values.map(({ value, name }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    return option;
  }));
  if (values.some(({ value }) => value === selected)) element.value = selected;
}
function dropdown(parent, title, values, selected, change) {
  const label = document.createElement('label');
  label.textContent = title;
  const select = document.createElement('select');
  choices(select, values.map((value) => ({ value, name: value })), selected);
  select.disabled = busy;
  select.onchange = () => change(select.value);
  label.append(select);
  parent.append(label);
}
async function command(data) {
  if (busy) return;
  busy = true;
  const vacuum = $('vacuum').value;
  render(false);
  updateMapControls();
  $('command-status').textContent = '명령 전송 중…';
  try {
    await request('vacuum-command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacuum, ...data }) });
    $('command-status').textContent = 'Home Assistant가 명령을 처리했습니다. 상태 갱신을 기다립니다.';
  } catch (error) {
    $('command-status').textContent = error.message;
  } finally {
    busy = false;
    await refresh(false);
  }
}
function button(parent, title, data, disabled) {
  const element = document.createElement('button');
  element.textContent = title;
  element.disabled = busy || disabled;
  element.onclick = () => command(data);
  parent.append(element);
}
function render(resetMap = true) {
  const vacuum = vacuums.find((item) => item.entityId === $('vacuum').value);
  $('metadata').hidden = true;
  $('metadata-content').replaceChildren();
  for (const id of ['commands', 'fan', 'controls', 'sensors']) $(id).replaceChildren();
  if (!vacuum) {
    clearMap();
    $('advanced-controls').replaceChildren();
    $('name').textContent = '청소기 없음'; $('state').textContent = ''; $('model').textContent = '';
    $('map').replaceChildren(); $('map-image').hidden = true;
    $('map-status').textContent = '플러그인에 선택된 로봇청소기가 없습니다.';
    return;
  }
  const metadata = vacuum.metadata;
  if (metadata && (metadata.rooms.length || metadata.maps.length || metadata.presets.length)) {
    $('metadata').hidden = false;
    const roomName = (id) => metadata.rooms.find((room) => room.id === id)?.name || `Room ${id}`;
    const lines = [
      ...metadata.maps.map((map) => `지도: ${map.name}${map.current ? ' (현재)' : ''} · ID ${map.id}`),
      ...(metadata.rooms.length ? [`방: ${metadata.rooms.map((room) => `${room.name} (${room.id})`).join(' · ')}`] : []),
      ...metadata.presets.map((preset) => `저장된 청소: ${preset.name} — ${preset.rooms.map(roomName).join(', ')} · ID ${preset.id}`),
    ];
    for (const line of lines) { const p = document.createElement('p'); p.textContent = line; $('metadata-content').append(p); }
  }
  const unavailable = ['unknown', 'unavailable'].includes(vacuum.state);
  renderAdvanced(vacuum, unavailable);
  updateMapControls();
  $('name').textContent = vacuum.name;
  $('state').textContent = `${vacuum.state}${vacuum.battery == null ? '' : ` · 배터리 ${vacuum.battery}%`} · HA 갱신: ${vacuum.updated || '알 수 없음'}`;
  $('model').textContent = [vacuum.integration, vacuum.model].filter(Boolean).join(' · ');
  for (const action of vacuum.commands) if (labels[action]) button($('commands'), labels[action], { command: action }, unavailable);
  if (vacuum.commands.includes('set_fan_speed') && !unavailable) dropdown($('fan'), '흡입력', vacuum.fanSpeeds, vacuum.fanSpeed, (fanSpeed) => command({ command: 'set_fan_speed', fanSpeed }));
  for (const item of vacuum.companions) {
    const disabled = unavailable || item.state === 'unavailable' || (item.entityId.startsWith('select.') && item.state === 'unknown');
    if (item.entityId.startsWith('select.') && !disabled) dropdown($('controls'), item.name, item.options, item.state, (option) => command({ command: 'select_option', entity: item.entityId, option }));
    else if (item.entityId.startsWith('button.')) button($('controls'), item.name, { command: 'press', entity: item.entityId }, disabled);
    else {
      const name = document.createElement('dt'); name.textContent = item.name;
      const value = document.createElement('dd'); value.textContent = `${item.state} ${item.unit || ''}`;
      $('sensors').append(name, value);
    }
  }
  if (resetMap) {
    const previousMap = $('map').value;
    choices($('map'), vacuum.maps.map((value) => ({ value, name: value })), $('map').value);
    if (previousMap !== $('map').value) clearMap();
    if (!vacuum.maps.length) {
      clearMap();
      $('map-image').hidden = true;
      $('map-status').textContent = '지도 엔티티가 없습니다. Xiaomi Home(MIoT)의 기본 제어만으로 지도가 제공되지는 않습니다. 모델을 지원하는 지도 연동을 추가하고 vacuumMapEntities에 image/camera 엔티티를 지정하세요.';
    }
  }
}
async function refreshMap() {
  const vacuum = $('vacuum').value;
  const entity = $('map').value;
  const current = ++revision;
  if (!entity) return;
  try {
    const data = await request(`vacuum-map?vacuum=${encodeURIComponent(vacuum)}&entity=${encodeURIComponent(entity)}`);
    if (current !== revision || vacuum !== $('vacuum').value || entity !== $('map').value) return;
if (mapSnapshot?.revision !== data.revision) { destination = null; $('target-marker').hidden = true; }
    mapSnapshot = data; imageReady = false; updateMapControls();
    const location = data.location;
    $('location').textContent = `${location.room ? `현재 방: ${location.room} · ` : ''}${location.position ? `로봇 좌표: ${location.position.x}, ${location.position.y}` : '로봇 좌표 미제공'} · ${location.stale ? '오래된 위치 정보' : '최근 위치 정보'} · HA 갱신: ${location.updated || '알 수 없음'}`;
    $('map-image').src = data.image;
    $('map-image').hidden = false;
    $('map-status').textContent = `지도 수신: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (current !== revision || vacuum !== $('vacuum').value || entity !== $('map').value) return;
    clearMap();
    $('map-image').hidden = true;
    $('map-status').textContent = error.message;
  }
}
async function refresh(withMap = true) {
  try {
    const data = await request('vacuums');
    vacuums = data.vacuums;
    choices($('vacuum'), vacuums.map((item) => ({ value: item.entityId, name: item.name })), $('vacuum').value);
    $('connection').textContent = `${vacuums.length}대 연결됨 · 상태 확인: ${new Date().toLocaleTimeString()}`;
    render();
    if (withMap) await refreshMap();
  } catch (error) {
    revision++; clearMap();
    $('connection').textContent = error.message;
    for (const element of document.querySelectorAll('button, #controls select, #fan select')) element.disabled = true;
    $('map-image').hidden = true;
    $('map-status').textContent = '연결이 끊겼습니다. 지도를 갱신할 수 없습니다.';
  }
}
$('vacuum').onchange = () => { revision++; clearMap(); selectedRooms.clear(); $('map-image').hidden = true; $('command-status').textContent = ''; render(); void refreshMap(); };
$('map').onchange = () => { clearMap(); $('map-image').hidden = true; void refreshMap(); };
async function poll() {
  if (!document.hidden && !busy) await refresh();
  setTimeout(poll, 10000);
}
void poll();

$('map-image').onload = () => { imageReady = true; updateMapControls(); };
$('map-image').onerror = () => { clearMap(); $('map-status').textContent = '지도 이미지를 표시할 수 없습니다.'; };
$('map-image').onclick = (event) => {
  const v = vacuums.find((item) => item.entityId === $('vacuum').value);
  const location = mapSnapshot?.location;
  if (busy || !imageReady || !v?.advancedControls?.goTo || !location || location.stale || !location.calibration.length || location.width !== $('map-image').naturalWidth || location.height !== $('map-image').naturalHeight) {
    $('target-status').textContent = '이동하려면 최신 지도·이미지 크기에 맞는 좌표 보정·Virtual Layer 이동 명령 설정이 필요합니다.';
    return;
  }
  const bounds = $('map-image').getBoundingClientRect();
  destination = { x: (event.clientX - bounds.left) / bounds.width * location.width, y: (event.clientY - bounds.top) / bounds.height * location.height };
  $('target-marker').style.left = `${destination.x / location.width * 100}%`;
  $('target-marker').style.top = `${destination.y / location.height * 100}%`;
  $('target-status').textContent = '목적지를 선택했습니다. 이동 버튼을 눌러 명령을 전송하세요.';
  updateMapControls();
};
$('go-to').onclick = () => {
  if (!destination || !mapSnapshot || $('go-to').disabled) return;
  const point = destination; destination = null;
  void command({ command: 'goTo', map: $('map').value, point, revision: mapSnapshot.revision });
};

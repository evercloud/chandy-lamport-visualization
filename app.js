const NODE_COUNT = 7;
const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 900;
const HEIGHT = 640;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS = 230;
const NODE_RADIUS = 26;

const PACKET_SPAWN_MS = 210;
const SNAPSHOT_COOLDOWN_MS = 1100;

const svg = document.getElementById("network");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const statusText = document.getElementById("statusText");

const state = {
  nodes: [],
  edges: [],
  channels: new Map(),
  runningSnapshot: false,
  completedSnapshot: false,
  lastSpawn: 0,
  nextAutoSnapshotAt: null,
  lastFrameTime: null,
  animationHandle: null,
};

function createSvgElement(tag, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function setStatus(message) {
  statusText.textContent = message;
}

function channelKey(fromId, toId) {
  return `${fromId}->${toId}`;
}

function getChannel(fromId, toId) {
  return state.channels.get(channelKey(fromId, toId));
}

function buildNodes() {
  const group = createSvgElement("g");
  svg.appendChild(group);

  for (let i = 0; i < NODE_COUNT; i += 1) {
    const angle = (Math.PI * 2 * i) / NODE_COUNT - Math.PI / 2;
    const x = CENTER_X + Math.cos(angle) * RADIUS;
    const y = CENTER_Y + Math.sin(angle) * RADIUS;
    const id = `P${i + 1}`;

    const nodeGroup = createSvgElement("g");
    const circle = createSvgElement("circle", {
      cx: x,
      cy: y,
      r: NODE_RADIUS,
      class: "node-circle",
    });
    const label = createSvgElement("text", { x, y, class: "node-label" });
    label.textContent = id;

    nodeGroup.appendChild(circle);
    nodeGroup.appendChild(label);
    group.appendChild(nodeGroup);

    state.nodes.push({
      id,
      x,
      y,
      circle,
      hasRecorded: false,
      closedIncoming: new Set(),
      channelState: {},
      localDelivered: 0,
      completedSnapshot: false,
    });
  }
}

function buildEdges() {
  const edgeLayer = createSvgElement("g");
  svg.insertBefore(edgeLayer, svg.firstChild);

  for (let i = 0; i < state.nodes.length; i += 1) {
    for (let j = i + 1; j < state.nodes.length; j += 1) {
      const source = state.nodes[i];
      const target = state.nodes[j];
      const line = createSvgElement("line", {
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        class: "edge",
      });
      edgeLayer.appendChild(line);
      state.edges.push({ source, target, line });
    }
  }
}

function buildChannels() {
  state.nodes.forEach((from) => {
    state.nodes.forEach((to) => {
      if (from.id === to.id) return;
      state.channels.set(channelKey(from.id, to.id), {
        from,
        to,
        queue: [],
        inFlight: null,
      });
    });
  });
}

function createPacketVisual(from, to, kind) {
  const circle = createSvgElement("circle", {
    cx: from.x,
    cy: from.y,
    r: kind === "marker" ? 5 : 4.2,
    fill: kind === "marker" ? "#ef4444" : "#facc15",
    opacity: kind === "marker" ? 0.95 : 0.9,
  });
  svg.appendChild(circle);
  return circle;
}

function enqueueMessage(from, to, kind) {
  const channel = getChannel(from.id, to.id);
  if (!channel) return;
  channel.queue.push({ kind });
}

function maybeStartChannelTransmission(channel) {
  if (channel.inFlight || channel.queue.length === 0) return;
  const message = channel.queue.shift();
  const visual = createPacketVisual(channel.from, channel.to, message.kind);
  const speed =
    message.kind === "marker" ? 0.0018 : 0.0010 + Math.random() * 0.00035;
  channel.inFlight = {
    kind: message.kind,
    visual,
    progress: 0,
    speed,
  };
}

function beginLocalSnapshot(node) {
  if (node.hasRecorded) return;
  node.hasRecorded = true;
  node.completedSnapshot = false;
  node.circle.classList.add("recording");
  node.closedIncoming.clear();
  node.channelState = {};

  state.nodes.forEach((other) => {
    if (other.id !== node.id) {
      node.channelState[other.id] = 0;
    }
  });

  state.nodes.forEach((target) => {
    if (target.id !== node.id) {
      enqueueMessage(node, target, "marker");
    }
  });
}

function handleMarkerArrival(channel) {
  const receiver = channel.to;
  const senderId = channel.from.id;
  const firstMarkerForProcess = !receiver.hasRecorded;

  if (firstMarkerForProcess) {
    beginLocalSnapshot(receiver);
  }

  receiver.closedIncoming.add(senderId);

  const incomingCount = state.nodes.length - 1;
  if (receiver.hasRecorded && receiver.closedIncoming.size === incomingCount) {
    receiver.completedSnapshot = true;
    receiver.circle.classList.remove("recording");
  }
}

function handleDataArrival(channel) {
  const receiver = channel.to;
  const senderId = channel.from.id;
  receiver.localDelivered += 1;

  if (!state.runningSnapshot) return;
  if (!receiver.hasRecorded) return;
  if (receiver.closedIncoming.has(senderId)) return;

  // Save in-transit messages for still-open incoming channels.
  receiver.channelState[senderId] += 1;
}

function updateChannels(deltaMs) {
  state.channels.forEach((channel) => {
    maybeStartChannelTransmission(channel);
    if (!channel.inFlight) return;

    channel.inFlight.progress += channel.inFlight.speed * deltaMs;
    if (channel.inFlight.progress > 1) {
      channel.inFlight.progress = 1;
    }

    const x =
      channel.from.x + (channel.to.x - channel.from.x) * channel.inFlight.progress;
    const y =
      channel.from.y + (channel.to.y - channel.from.y) * channel.inFlight.progress;
    channel.inFlight.visual.setAttribute("cx", String(x));
    channel.inFlight.visual.setAttribute("cy", String(y));

    if (channel.inFlight.progress < 1) return;

    if (channel.inFlight.kind === "marker") {
      handleMarkerArrival(channel);
    } else {
      handleDataArrival(channel);
    }
    channel.inFlight.visual.remove();
    channel.inFlight = null;
    maybeStartChannelTransmission(channel);
  });
}

function maybeCompleteSnapshot() {
  if (!state.runningSnapshot || state.completedSnapshot) return;

  const allRecorded = state.nodes.every((node) => node.hasRecorded);
  if (!allRecorded) return;

  const allIncomingClosed = state.nodes.every(
    (node) => node.closedIncoming.size === state.nodes.length - 1
  );
  if (!allIncomingClosed) return;

  state.runningSnapshot = false;
  state.completedSnapshot = true;
  setStatus("Snapshot complete. Finalizing and preparing next run...");

  window.setTimeout(() => {
    state.nodes.forEach((node) => {
      node.hasRecorded = false;
      node.completedSnapshot = false;
      node.closedIncoming.clear();
      node.channelState = {};
      node.circle.classList.remove("recording");
    });
    state.completedSnapshot = false;
    scheduleNextAutoSnapshot(state.lastFrameTime ?? performance.now());
    setStatus("Restored. Manual and auto snapshot are available.");
  }, SNAPSHOT_COOLDOWN_MS);
}

function randomNodePair() {
  const fromIndex = Math.floor(Math.random() * state.nodes.length);
  let toIndex = Math.floor(Math.random() * state.nodes.length);
  while (toIndex === fromIndex) {
    toIndex = Math.floor(Math.random() * state.nodes.length);
  }
  return [state.nodes[fromIndex], state.nodes[toIndex]];
}

function spawnDataPacket() {
  const [from, to] = randomNodePair();
  enqueueMessage(from, to, "data");
}

function triggerSnapshot(mode = "manual") {
  if (state.runningSnapshot || state.completedSnapshot) return;
  const initiator = state.nodes[Math.floor(Math.random() * state.nodes.length)];
  state.runningSnapshot = true;
  state.nodes.forEach((node) => {
    node.hasRecorded = false;
    node.completedSnapshot = false;
    node.closedIncoming.clear();
    node.channelState = {};
    node.circle.classList.remove("recording");
  });
  const sourceLabel = mode === "auto" ? "Auto" : "Manual";
  setStatus(
    `${sourceLabel} snapshot: ${initiator.id} started and sent markers on all outgoing channels.`
  );
  beginLocalSnapshot(initiator);
  scheduleNextAutoSnapshot(state.lastFrameTime ?? performance.now());
}

function scheduleNextAutoSnapshot(nowMs) {
  const minDelay = 2500;
  const maxDelay = 5200;
  state.nextAutoSnapshotAt = nowMs + minDelay + Math.random() * (maxDelay - minDelay);
}

function frame(timestamp) {
  if (state.lastFrameTime === null) {
    state.lastFrameTime = timestamp;
  }
  const deltaMs = timestamp - state.lastFrameTime;
  state.lastFrameTime = timestamp;

  state.lastSpawn += deltaMs;
  if (state.lastSpawn >= PACKET_SPAWN_MS) {
    state.lastSpawn = 0;
    spawnDataPacket();
  }

  if (
    !state.runningSnapshot &&
    !state.completedSnapshot &&
    state.nextAutoSnapshotAt !== null &&
    timestamp >= state.nextAutoSnapshotAt
  ) {
    triggerSnapshot("auto");
  }

  updateChannels(deltaMs);
  maybeCompleteSnapshot();
  state.animationHandle = window.requestAnimationFrame(frame);
}

function clearChannelTraffic() {
  state.channels.forEach((channel) => {
    channel.queue = [];
    if (channel.inFlight?.visual) {
      channel.inFlight.visual.remove();
    }
    channel.inFlight = null;
  });
}

function resetSimulation() {
  state.runningSnapshot = false;
  state.completedSnapshot = false;
  state.lastSpawn = 0;
  state.nodes.forEach((node) => {
    node.hasRecorded = false;
    node.completedSnapshot = false;
    node.closedIncoming.clear();
    node.channelState = {};
    node.localDelivered = 0;
    node.circle.classList.remove("recording");
  });
  clearChannelTraffic();
  scheduleNextAutoSnapshot(state.lastFrameTime ?? performance.now());
  setStatus("Idle. Press Start Manual Snapshot.");
}

function init() {
  buildNodes();
  buildEdges();
  buildChannels();
  scheduleNextAutoSnapshot(performance.now());
  startBtn.addEventListener("click", () => triggerSnapshot("manual"));
  resetBtn.addEventListener("click", resetSimulation);
  state.animationHandle = window.requestAnimationFrame(frame);
}

init();

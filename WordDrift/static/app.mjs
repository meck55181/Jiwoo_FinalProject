import { ParticleField } from './particles.mjs';

// Connects the Flask recognition results, Braille animation, and ESP32 sensor.
const $ = id => document.getElementById(id);

const ui = {
  canvas: $('braille'),
  prediction: $('prediction'),
  sentence: $('sentence'),
  cameraFeed: $('camera-feed'),
  cameraStatus: $('camera-status'),
  connectButton: $('connect'),
  distance: $('distance')
};

const ctx = ui.canvas.getContext('2d');
const dots = new ParticleField();

const SETTINGS = {
  nearDistanceCm: 30,
  minDistanceCm: 2,
  maxDistanceCm: 400,
  serialBaudRate: 115200,
  statePollIntervalMs: 200,
  sensorTimeoutMs: 2000,
  maxPendingCharacters: 256
};

let sentence = '';
let previousFrameTime = performance.now();
let lastSensorReading = 0;
let port = null;
let reader = null;
let cameraFailed = false;

// Resize the canvas for its display size and keep it sharp on high-density screens.
new ResizeObserver(() => {
  const { width, height } = ui.canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);

  ui.canvas.width = Math.round(width * scale);
  ui.canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // Recalculate dot targets when the canvas size changes.
  dots.setText(sentence, width, height);
}).observe(ui.canvas);

// ParticleField updates movement; this loop draws the dots on the canvas.
function animate(time) {
  const deltaTime = (time - previousFrameTime) / 1000;
  previousFrameTime = time;

  dots.step(deltaTime);
  ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
  ctx.fillStyle = 'white';

  for (const dot of dots.particles) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Read the latest recognition state from the Flask server.
async function updateCamera() {
  try {
    const response = await fetch('/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load recognition state.');

    const data = await response.json();
    ui.prediction.textContent = data.prediction || '-';

    // Rebuild the Braille targets only when the recognized sentence changes.
    if (data.sentence !== sentence) {
      sentence = data.sentence || '';
      ui.sentence.textContent = sentence;
      ui.canvas.setAttribute('aria-label', `Braille: ${sentence}`);
      dots.setText(sentence);
    }

    ui.cameraStatus.textContent = data.camera_error || '';

    if (data.camera_error) {
      ui.cameraFeed.hidden = true;
    } else if (data.camera_active) {
      ui.cameraFeed.hidden = false;

      // Retry the video stream if the image element previously failed to load it.
      if (cameraFailed) {
        ui.cameraFeed.src = `/video_feed?t=${Date.now()}`;
        cameraFailed = false;
      }
    }
  } catch {
    ui.cameraStatus.textContent = 'Please check the server connection.';
  } finally {
    // Schedule the next request after this one finishes to avoid overlapping polls.
    setTimeout(updateCamera, SETTINGS.statePollIntervalMs);
  }
}

ui.cameraFeed.addEventListener('error', () => {
  cameraFailed = true;
});
updateCamera();

// Read newline-separated distance values from the ESP32 over Web Serial.
ui.connectButton.addEventListener('click', async () => {
  if (!navigator.serial) {
    ui.distance.textContent = 'Please connect using Chrome or Edge.';
    return;
  }

  // Cancel the active read to disconnect the sensor.
  if (port) {
    try {
      await reader?.cancel();
    } catch {
      // The read loop handles cleanup if cancellation fails.
    }
    return;
  }

  ui.connectButton.disabled = true;

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: SETTINGS.serialBaudRate });
    reader = port.readable.getReader();

    ui.connectButton.textContent = 'Disconnect';
    ui.connectButton.disabled = false;
    ui.distance.textContent = 'Waiting for distance data';

    // Show the moving state until the first valid sensor reading arrives.
    lastSensorReading = performance.now();
    dots.setNear(false);

    const decoder = new TextDecoder();
    let pendingText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Serial data may arrive in partial chunks, so process complete lines only.
      pendingText += decoder.decode(value, { stream: true });
      const lines = pendingText.split('\n');
      pendingText = lines.pop();

      for (const line of lines) {
        const distanceCm = Number(line.trim());

        // Ignore invalid readings and values outside the sensor's expected range.
        if (
          !Number.isFinite(distanceCm) ||
          distanceCm < SETTINGS.minDistanceCm ||
          distanceCm > SETTINGS.maxDistanceCm
        ) {
          continue;
        }

        lastSensorReading = performance.now();
        dots.setNear(distanceCm <= SETTINGS.nearDistanceCm);
        ui.distance.textContent = `${distanceCm.toFixed(1)} cm`;
      }

      // Prevent an incomplete or malformed line from growing the buffer indefinitely.
      if (pendingText.length > SETTINGS.maxPendingCharacters) {
        pendingText = '';
      }
    }
  } catch (error) {
    ui.distance.textContent =
      error.name === 'NotFoundError'
        ? 'Port selection cancelled'
        : 'Please check the sensor connection.';
  } finally {
    // Release the reader and close the port after disconnecting or an error.
    if (reader) {
      reader.releaseLock();
      reader = null;
    }

    if (port) {
      try {
        await port.close();
      } catch {
        // The port may already be closed.
      }
      port = null;
    }

    // Return to the readable Braille layout when the sensor is disconnected.
    dots.setNear(true);
    ui.connectButton.textContent = 'Connect Sensor';
    ui.connectButton.disabled = false;

    if (
      !['Port selection cancelled', 'Please check the sensor connection.']
        .includes(ui.distance.textContent)
    ) {
      ui.distance.textContent = 'Not connected';
    }
  }
});

// Change to the no-signal state if no valid reading arrives for two seconds.
setInterval(() => {
  const sensorTimedOut =
    reader &&
    performance.now() - lastSensorReading > SETTINGS.sensorTimeoutMs;

  if (sensorTimedOut) {
    dots.setNear(false);
    ui.distance.textContent = 'No sensor signal';
  }
}, 500);
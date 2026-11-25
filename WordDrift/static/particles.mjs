// Unicode Braille patterns for the letters A–Z.
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const BRAILLE_PATTERNS = [...'⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵'];

export const BRAILLE = Object.freeze(
  Object.fromEntries(
    LETTERS.map((letter, index) => [letter, BRAILLE_PATTERNS[index]])
  )
);

// Keep uppercase English letters and spaces for the layout.
export function cleanText(text) {
  return String(text).toUpperCase().replace(/[^A-Z ]/g, '');
}

// Convert each filled Braille dot into a target position on the canvas.
export function layout(text, width, height) {
  text = cleanText(text);

  if (!text || width <= 0 || height <= 0) return [];

  const margin = Math.min(36, width * 0.06, height * 0.06);
  const availableWidth = width - margin * 2;
  const availableHeight = height - margin * 2;

  const baseCellWidth = 62;
  const baseCellHeight = 90;
  let columns = 1;
  let scale = 0;

  // Find the largest cell size that fits the full sentence.
  for (let count = 1; count <= text.length; count++) {
    const candidateScale = Math.min(
      1.65,
      availableWidth / (count * baseCellWidth),
      availableHeight / (Math.ceil(text.length / count) * baseCellHeight)
    );

    if (candidateScale >= scale) {
      scale = candidateScale;
      columns = count;
    }
  }

  const cellWidth = baseCellWidth * scale;
  const cellHeight = baseCellHeight * scale;
  const rows = Math.ceil(text.length / columns);
  const startY = (height - rows * cellHeight) / 2;
  const targets = [];

  for (let index = 0; index < text.length; index++) {
    const letter = text[index];
    const pattern = BRAILLE[letter];

    // Spaces take up a cell but do not create dots.
    if (!pattern) continue;

    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowLength = Math.min(columns, text.length - row * columns);
    const startX = (width - rowLength * cellWidth) / 2;

    // Each Unicode Braille character stores its six dot positions as bits.
    const dotMask = pattern.codePointAt(0) - 0x2800;

    for (let bit = 0; bit < 6; bit++) {
      if (!(dotMask & (1 << bit))) continue;

      targets.push({
        id: `${index}:${bit}`,
        x:
          startX +
          (column + 0.5) * cellWidth +
          (Math.floor(bit / 3) - 0.5) * 23 * scale,
        y:
          startY +
          (row + 0.5) * cellHeight +
          ((bit % 3) - 1) * 23 * scale,
        radius: 6 * scale
      });
    }
  }

  return targets;
}

// Keep a moving dot inside the canvas by reflecting it off the edges.
export function reflect(position, velocity, low, high) {
  const span = high - low;

  if (span <= 0) return [(low + high) / 2, 0];

  if (position >= low && position <= high) {
    if (
      (position === low && velocity < 0) ||
      (position === high && velocity > 0)
    ) {
      velocity *= -1;
    }

    return [position, velocity];
  }

  // Handle large movements that cross an edge in a single frame.
  const phase = ((position - low) % (2 * span) + 2 * span) % (2 * span);

  return phase < span
    ? [low + phase, velocity]
    : [high - (phase - span), -velocity];
}

export class ParticleField {
  constructor() {
    this.particles = [];
    this.width = 1;
    this.height = 1;
    this.near = true;
  }

  setText(text, width = this.width, height = this.height) {
    this.width = width;
    this.height = height;

    // Reuse dots with matching IDs so the animation does not restart unnecessarily.
    const existingDots = new Map(this.particles.map(dot => [dot.id, dot]));

    this.particles = layout(text, width, height).map(target => {
      const existingDot = existingDots.get(target.id);

      if (existingDot) {
        existingDot.tx = target.x;
        existingDot.ty = target.y;
        existingDot.radius = target.radius;
        return existingDot;
      }

      // Start new dots at random positions with random movement directions.
      const angle = Math.random() * Math.PI * 2;
      const speed = 36 + Math.random() * 42;

      return {
        id: target.id,
        tx: target.x,
        ty: target.y,
        radius: target.radius,
        x: target.radius + Math.random() * Math.max(0, width - 2 * target.radius),
        y: target.radius + Math.random() * Math.max(0, height - 2 * target.radius),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      };
    });

    this.constrain();
  }

  setNear(near) {
    // Give the dots a new direction when the sensor changes from near to far.
    if (this.near && !near) {
      for (const dot of this.particles) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 36 + Math.random() * 42;

        dot.vx = Math.cos(angle) * speed;
        dot.vy = Math.sin(angle) * speed;
      }
    }

    this.near = near;
  }

  constrain() {
    // Keep dots inside the canvas after the canvas or text layout changes.
    for (const dot of this.particles) {
      dot.x = Math.max(dot.radius, Math.min(this.width - dot.radius, dot.x));
      dot.y = Math.max(dot.radius, Math.min(this.height - dot.radius, dot.y));
    }
  }

  step(deltaTime) {
    // Limit the time step to prevent large jumps when a frame is delayed.
    const dt = Math.min(Math.max(deltaTime, 0), 1 / 30);

    for (const dot of this.particles) {
      if (this.near) {
        // A spring-like force moves each dot toward its Braille target.
        dot.vx += ((dot.tx - dot.x) * 55 - dot.vx * 15) * dt;
        dot.vy += ((dot.ty - dot.y) * 55 - dot.vy * 15) * dt;
      }

      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;

      [dot.x, dot.vx] = reflect(
        dot.x,
        dot.vx,
        dot.radius,
        this.width - dot.radius
      );
      [dot.y, dot.vy] = reflect(
        dot.y,
        dot.vy,
        dot.radius,
        this.height - dot.radius
      );
    }
  }
}
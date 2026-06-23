const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const GAME_WIDTH = 1920;
const GAME_HEIGHT = 1080;
const CENTER_X = GAME_WIDTH / 2;
const CENTER_Y = GAME_HEIGHT / 2;

const ENTITY_COUNT = 45;
const ENTITY_RADIUS = 18;
const SPAWN_RADIUS = ENTITY_RADIUS * 2;
const REPEL_RADIUS = ENTITY_RADIUS * 1.8;
const REPEL_FORCE = 26000;
const RANDOM_FORCE_MIN = 460;
const RANDOM_FORCE_MAX = 960;
const RANDOM_FORCE_MIN_DURATION = 0.16;
const RANDOM_FORCE_MAX_DURATION = 0.55;
const RANDOM_FORCE_MIN_WAIT = 2.0;
const RANDOM_FORCE_MAX_WAIT = 4.4;
const DAMPING = 0.1;
const MAX_SPEED = 200;
const WALL_BOUNCE = 0.55;
const PLAYER_SIZE = 54;
const PLAYER_SPEED = 420;
const PLAYER_PUSH_SHARE = 0.68;
const GRASS_COLOR = "#3c8f3d";
const WATER_WIDTH = 96;
const WATER_COLOR = "#286fbb";
const WATER_EDGE_COLOR = "#174d86";

const keys = new Set();

const player = {
  x: CENTER_X - PLAYER_SIZE / 2,
  y: CENTER_Y + 180,
  width: PLAYER_SIZE,
  height: PLAYER_SIZE,
};

const entities = Array.from({ length: ENTITY_COUNT }, (_, index) => {
  const angle = goldenAngle(index);
  const distance = randomRange(0, SPAWN_RADIUS);

  return {
    id: index,
    x: CENTER_X + Math.cos(angle) * distance,
    y: CENTER_Y + Math.sin(angle) * distance,
    vx: Math.cos(angle) * randomRange(40, 180),
    vy: Math.sin(angle) * randomRange(40, 180),
    ax: 0,
    ay: 0,
    forceX: 0,
    forceY: 0,
    forceTimeLeft: 0,
    forceWait: randomRange(0, RANDOM_FORCE_MAX_WAIT),
    hue: 165 + index * 9,
  };
});

let lastTime = performance.now();

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function update(deltaSeconds) {
  resetAccelerations();
  applyRepulsion();
  updateRandomForces(deltaSeconds);
  updatePlayer(deltaSeconds);
  integrateEntities(deltaSeconds);
  removeEntitiesInWater();
  resolvePlayerEntityCollisions();
}

function resetAccelerations() {
  for (const entity of entities) {
    entity.ax = 0;
    entity.ay = 0;
  }
}

function applyRepulsion() {
  for (let a = 0; a < entities.length; a += 1) {
    for (let b = a + 1; b < entities.length; b += 1) {
      const first = entities[a];
      const second = entities[b];

      let dx = second.x - first.x;
      let dy = second.y - first.y;
      let distance = Math.hypot(dx, dy);

      if (distance === 0) {
        const angle = goldenAngle(first.id + second.id);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }

      if (distance > REPEL_RADIUS) {
        continue;
      }

      const normalX = dx / distance;
      const normalY = dy / distance;
      const closeness = 1 - distance / REPEL_RADIUS;
      const force = REPEL_FORCE * closeness * closeness;

      first.ax -= normalX * force;
      first.ay -= normalY * force;
      second.ax += normalX * force;
      second.ay += normalY * force;
    }
  }
}

function updateRandomForces(deltaSeconds) {
  for (const entity of entities) {
    if (entity.forceTimeLeft > 0) {
      entity.forceTimeLeft = Math.max(0, entity.forceTimeLeft - deltaSeconds);
      entity.ax += entity.forceX;
      entity.ay += entity.forceY;
      continue;
    }

    entity.forceWait -= deltaSeconds;

    if (entity.forceWait <= 0) {
      startRandomForce(entity);
    }
  }
}

function startRandomForce(entity) {
  const angle = Math.random() * Math.PI * 2;
  const strength = randomRange(RANDOM_FORCE_MIN, RANDOM_FORCE_MAX);

  entity.forceX = Math.cos(angle) * strength;
  entity.forceY = Math.sin(angle) * strength;
  entity.forceTimeLeft = randomRange(RANDOM_FORCE_MIN_DURATION, RANDOM_FORCE_MAX_DURATION);
  entity.forceWait = randomRange(RANDOM_FORCE_MIN_WAIT, RANDOM_FORCE_MAX_WAIT);
}

function updatePlayer(deltaSeconds) {
  let moveX = 0;
  let moveY = 0;

  if (keys.has("arrowleft") || keys.has("a")) {
    moveX -= 1;
  }

  if (keys.has("arrowright") || keys.has("d")) {
    moveX += 1;
  }

  if (keys.has("arrowup") || keys.has("w")) {
    moveY -= 1;
  }

  if (keys.has("arrowdown") || keys.has("s")) {
    moveY += 1;
  }

  if (moveX !== 0 || moveY !== 0) {
    const length = Math.hypot(moveX, moveY);
    player.x += (moveX / length) * PLAYER_SPEED * deltaSeconds;
    player.y += (moveY / length) * PLAYER_SPEED * deltaSeconds;
  }

  clampPlayerToWalls();
}

function integrateEntities(deltaSeconds) {
  const dampingThisFrame = DAMPING ** deltaSeconds;

  for (const entity of entities) {
    entity.vx += entity.ax * deltaSeconds;
    entity.vy += entity.ay * deltaSeconds;

    const speed = Math.hypot(entity.vx, entity.vy);
    if (speed > MAX_SPEED) {
      entity.vx = (entity.vx / speed) * MAX_SPEED;
      entity.vy = (entity.vy / speed) * MAX_SPEED;
    }

    entity.vx *= dampingThisFrame;
    entity.vy *= dampingThisFrame;

    entity.x += entity.vx * deltaSeconds;
    entity.y += entity.vy * deltaSeconds;

    resolveWallBounce(entity);
  }
}

function resolvePlayerEntityCollisions() {
  for (const entity of entities) {
    const closestX = clamp(entity.x, player.x, player.x + player.width);
    const closestY = clamp(entity.y, player.y, player.y + player.height);
    let dx = entity.x - closestX;
    let dy = entity.y - closestY;
    let distance = Math.hypot(dx, dy);

    if (distance >= ENTITY_RADIUS) {
      continue;
    }

    if (distance === 0) {
      dx = entity.x - (player.x + player.width / 2);
      dy = entity.y - (player.y + player.height / 2);
      distance = Math.hypot(dx, dy);

      if (distance === 0) {
        dx = 1;
        dy = 0;
        distance = 1;
      }
    }

    const normalX = dx / distance;
    const normalY = dy / distance;
    const overlap = ENTITY_RADIUS - distance;
    const playerPush = overlap * PLAYER_PUSH_SHARE;
    const entityPush = overlap - playerPush;

    player.x -= normalX * playerPush;
    player.y -= normalY * playerPush;
    entity.x += normalX * entityPush;
    entity.y += normalY * entityPush;

    const velocityIntoPlayer = entity.vx * -normalX + entity.vy * -normalY;
    if (velocityIntoPlayer > 0) {
      player.x -= normalX * Math.min(velocityIntoPlayer * 0.025, ENTITY_RADIUS);
      player.y -= normalY * Math.min(velocityIntoPlayer * 0.025, ENTITY_RADIUS);
    }

    clampPlayerToWalls();
    resolveWallBounce(entity);
  }
}

function removeEntitiesInWater() {
  for (let i = entities.length - 1; i >= 0; i -= 1) {
    const entity = entities[i];

    if (isInWater(entity.x, entity.y, ENTITY_RADIUS)) {
      entities.splice(i, 1);
    }
  }
}

function clampPlayerToWalls() {
  player.x = clamp(player.x, 0, GAME_WIDTH - player.width);
  player.y = clamp(player.y, 0, GAME_HEIGHT - player.height);
}

function resolveWallBounce(entity) {
  if (entity.x < ENTITY_RADIUS) {
    entity.x = ENTITY_RADIUS;
    entity.vx = Math.abs(entity.vx) * WALL_BOUNCE;
  } else if (entity.x > GAME_WIDTH - ENTITY_RADIUS) {
    entity.x = GAME_WIDTH - ENTITY_RADIUS;
    entity.vx = -Math.abs(entity.vx) * WALL_BOUNCE;
  }

  if (entity.y < ENTITY_RADIUS) {
    entity.y = ENTITY_RADIUS;
    entity.vy = Math.abs(entity.vy) * WALL_BOUNCE;
  } else if (entity.y > GAME_HEIGHT - ENTITY_RADIUS) {
    entity.y = GAME_HEIGHT - ENTITY_RADIUS;
    entity.vy = -Math.abs(entity.vy) * WALL_BOUNCE;
  }
}

function draw() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawBackground();
  drawRepelRanges();
  drawEntities();
  drawPlayer();
}

function drawBackground() {
  ctx.fillStyle = GRASS_COLOR;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawWaterMoat();

  ctx.strokeStyle = "#283142";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, GAME_WIDTH - 6, GAME_HEIGHT - 6);
}

function drawWaterMoat() {
  ctx.fillStyle = WATER_COLOR;
  ctx.fillRect(0, 0, GAME_WIDTH, WATER_WIDTH);
  ctx.fillRect(0, GAME_HEIGHT - WATER_WIDTH, GAME_WIDTH, WATER_WIDTH);
  ctx.fillRect(0, WATER_WIDTH, WATER_WIDTH, GAME_HEIGHT - WATER_WIDTH * 2);
  ctx.fillRect(GAME_WIDTH - WATER_WIDTH, WATER_WIDTH, WATER_WIDTH, GAME_HEIGHT - WATER_WIDTH * 2);

  ctx.strokeStyle = WATER_EDGE_COLOR;
  ctx.lineWidth = 5;
  ctx.strokeRect(WATER_WIDTH, WATER_WIDTH, GAME_WIDTH - WATER_WIDTH * 2, GAME_HEIGHT - WATER_WIDTH * 2);
}

function drawRepelRanges() {
  ctx.strokeStyle = "rgb(90 130 170 / 0.08)";
  ctx.lineWidth = 2;

  for (const entity of entities) {
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, REPEL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEntities() {
  for (const entity of entities) {
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, ENTITY_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${entity.hue} 72% 48%)`;
    ctx.fill();
    ctx.strokeStyle = entity.forceTimeLeft > 0 ? "#ffffff" : "#dce8ff";
    ctx.lineWidth = entity.forceTimeLeft > 0 ? 5 : 3;
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.fillStyle = "#f6c95f";
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.strokeStyle = "#fff6d5";
  ctx.lineWidth = 5;
  ctx.strokeRect(player.x, player.y, player.width, player.height);
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isInWater(x, y, radius) {
  return (
    x - radius < WATER_WIDTH ||
    x + radius > GAME_WIDTH - WATER_WIDTH ||
    y - radius < WATER_WIDTH ||
    y + radius > GAME_HEIGHT - WATER_WIDTH
  );
}

function goldenAngle(index) {
  return index * 2.399963229728653;
}

function loop(now) {
  const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(deltaSeconds);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
